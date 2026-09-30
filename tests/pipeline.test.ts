import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('../src/api/fal',()=>({ submitFalJob:vi.fn(),pollFalJob:vi.fn(),generateFalFoleyAudio:vi.fn(),upscaleFalVideo:vi.fn() }));
vi.mock('../src/api/imageUpload',()=>({ensureImageUrl:vi.fn(),uploadToFal:vi.fn(),prepareModelImage:vi.fn()}));
vi.mock('../src/api/helpers', async original => ({...await original<typeof import('../src/api/helpers')>(),extractLastFrame:vi.fn(),stitchVideos:vi.fn(),cacheVideo:vi.fn()}));
import * as fal from '../src/api/fal';
import * as media from '../src/api/helpers';
import * as upload from '../src/api/imageUpload';
import { runPipeline, type PipelineCallbacks } from '../src/api/orchestrator';
import { MODEL_REGISTRY } from '../src/constants';
import type { FeatureSwitches, GenerationParams } from '../src/types';
const p: GenerationParams = {model:MODEL_REGISTRY.find(m=>m.id==='fal-ltx-2.3-22b-i2v')!,prompt:'Pan',negativePrompt:'blur',durationSeconds:3,aspectRatio:'16:9',seed:42,cfgScale:.5,imageUrl:'data:image/png;base64,first'};
const switches: FeatureSwitches = {autoStitch:true,keepIntermediateSlices:true,generateFoleyAudio:false,aiUpscaleFinal:false,foleyPrompt:'sounds',autoEnhancePrompt:false,enableGumroadGate:false,gumroadProductId:''};
const keys = {fal:'test',replicate:'',luma:'',runway:'',comfyui:''};
const callbacks = (): PipelineCallbacks => Object.fromEntries(['onSegmentCreated','onSegmentUpdated','onStitchStart','onStitchComplete','onAudioStart','onAudioComplete','onUpscaleStart','onUpscaleComplete','onError','onProgress'].map(k=>[k,vi.fn()])) as unknown as PipelineCallbacks;
beforeEach(()=>{
  vi.resetAllMocks();vi.mocked(media.cacheVideo).mockImplementation(async url=>url);vi.mocked(upload.prepareModelImage).mockImplementation(async p=>p.imageUrl);vi.mocked(fal.submitFalJob).mockResolvedValue({requestId:'job',statusUrl:'status',responseUrl:'result'});
  vi.mocked(fal.pollFalJob).mockResolvedValue('https://v3.fal.media/segment.mp4');
  vi.mocked(media.extractLastFrame).mockResolvedValue('data:image/png;base64,last');
  vi.mocked(media.stitchVideos).mockResolvedValue('/outputs/final.mp4');
  vi.mocked(upload.ensureImageUrl).mockImplementation(async url=>'https://v3.fal.media/'+url.split(',')[1]+'.png');
  vi.mocked(upload.uploadToFal).mockResolvedValue('https://v3.fal.media/final.mp4');
});
it('multi-segment chaining uses the actual extracted frame and locked seed',async()=>{
  const cb=callbacks();await runPipeline(p,8,keys,switches,cb);
  const calls=vi.mocked(fal.submitFalJob).mock.calls;
  expect(calls.map(c=>c[0].durationSeconds)).toEqual([3,3,2]);
  expect(calls.map(c=>c[0].imageUrl)).toEqual(['https://v3.fal.media/first.png','https://v3.fal.media/last.png','https://v3.fal.media/last.png']);
  expect(calls.every(c=>c[0].seed===42)).toBe(true);
  expect(media.extractLastFrame).toHaveBeenCalledTimes(2);expect(cb.onStitchComplete).toHaveBeenCalledWith('/outputs/final.mp4');
});
it('continuity extraction failure is a real error, never original-image fallback',async()=>{
  vi.mocked(media.extractLastFrame).mockRejectedValue(new Error('frame failed'));
  const cb=callbacks();await expect(runPipeline(p,8,keys,switches,cb)).rejects.toThrow('frame failed');expect(fal.submitFalJob).toHaveBeenCalledTimes(1);expect(cb.onError).toHaveBeenCalled();
});
it.each([true,false])('stitch enabled=%s exposes output',async enabled=>{
  const cb=callbacks();await runPipeline(p,6,keys,{...switches,autoStitch:enabled},cb);
  expect(media.stitchVideos).toHaveBeenCalledTimes(enabled?1:0);expect(cb.onStitchComplete).toHaveBeenCalled();
});
it('single segment exposes output without stitching',async()=>{
  const cb=callbacks();await runPipeline(p,3,keys,switches,cb);expect(media.stitchVideos).not.toHaveBeenCalled();expect(cb.onStitchComplete).toHaveBeenCalledWith('https://v3.fal.media/segment.mp4');
});
it.each(['foley','upscale'] as const)('%s success and failure are independent of successful base generation',async kind=>{
  const fn=kind==='foley'?vi.mocked(fal.generateFalFoleyAudio):vi.mocked(fal.upscaleFalVideo);
  const flags={...switches,generateFoleyAudio:kind==='foley',aiUpscaleFinal:kind==='upscale'};
  fn.mockResolvedValue('https://v3.fal.media/processed.mp4');let cb=callbacks();await runPipeline(p,6,keys,flags,cb);
  expect(kind==='foley'?cb.onAudioComplete:cb.onUpscaleComplete).toHaveBeenCalledWith('https://v3.fal.media/processed.mp4');
  fn.mockRejectedValue(new Error('optional failed'));cb=callbacks();await expect(runPipeline(p,6,keys,flags,cb)).resolves.toBeUndefined();expect(cb.onStitchComplete).toHaveBeenCalled();expect(cb.onError).not.toHaveBeenCalled();
});
it('aborted run cannot publish output',async()=>{
  const c=new AbortController();vi.mocked(fal.pollFalJob).mockImplementation(async()=>{c.abort();return 'https://v3.fal.media/segment.mp4';});
  const cb=callbacks();await expect(runPipeline(p,6,keys,switches,cb,c.signal)).rejects.toMatchObject({name:'AbortError'});expect(cb.onStitchComplete).not.toHaveBeenCalled();
});
it('Foley failure does not prevent upscale and stitching-off uses first-clip duration',async()=>{
  vi.mocked(fal.generateFalFoleyAudio).mockRejectedValue(new Error('Foley failed'));
  vi.mocked(fal.upscaleFalVideo).mockResolvedValue('https://v3.fal.media/upscaled.mp4');
  const cb=callbacks();await runPipeline(p,6,keys,{...switches,autoStitch:false,generateFoleyAudio:true,aiUpscaleFinal:true},cb);
  expect(vi.mocked(fal.generateFalFoleyAudio).mock.calls[0][5]).toBe(3);
  expect(cb.onUpscaleComplete).toHaveBeenCalledWith('https://v3.fal.media/upscaled.mp4');
});
it('archive switch is respected and missing optional credentials do not hide video',async()=>{
  const cb=callbacks();await runPipeline(p,3,keys,{...switches,keepIntermediateSlices:false},cb);
  expect(media.cacheVideo).not.toHaveBeenCalled();expect(cb.onStitchComplete).toHaveBeenCalled();
});
