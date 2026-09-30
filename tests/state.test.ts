// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { it, expect, vi, beforeEach } from 'vitest';
vi.mock('../src/api/orchestrator',()=>({runPipeline:vi.fn()}));
import { runPipeline } from '../src/api/orchestrator';
import { usePipeline } from '../src/hooks/usePipeline';
import { MODEL_REGISTRY } from '../src/constants';
const keys={fal:'test',replicate:'',runway:'',luma:'',comfyui:''};
const params={model:MODEL_REGISTRY.find(m=>m.id==='fal-ltx-2.5-pro-i2v')!,prompt:'Pan',negativePrompt:'',durationSeconds:6,aspectRatio:'16:9',seed:null,cfgScale:.5,imageUrl:'https://v3.fal.media/input.png'};
const switches={autoStitch:true,keepIntermediateSlices:true,generateFoleyAudio:true,aiUpscaleFinal:true,foleyPrompt:'',autoEnhancePrompt:false,enableGumroadGate:false,gumroadProductId:''};
beforeEach(()=>vi.resetAllMocks());
it('optional processing callbacks cannot leave a successful run busy',async()=>{
  vi.mocked(runPipeline).mockImplementation(async(_p,_d,_k,_s,cb)=>{cb.onStitchStart();cb.onStitchComplete('/outputs/video.mp4');cb.onAudioStart();cb.onProgress('sys','Foley failed');cb.onUpscaleStart();cb.onProgress('sys','Upscale failed');});
  const {result}=renderHook(()=>usePipeline(keys));
  await act(()=>result.current.startPipeline(params,6,switches));expect(result.current.pipelineState.status).toBe('complete');
});
it('fatal error reaches error and does not save success',async()=>{
  vi.mocked(runPipeline).mockRejectedValue(new Error('generation failed'));const save=vi.fn();
  const {result}=renderHook(()=>usePipeline(keys));await act(()=>result.current.startPipeline(params,6,switches,save));expect(result.current.pipelineState.status).toBe('error');expect(save).not.toHaveBeenCalled();
});
it('cancel during stitching prevents stale callbacks affecting a new run',async()=>{
  let callbacks: any;let finish: ()=>void=()=>{};
  vi.mocked(runPipeline).mockImplementationOnce(async(_p,_d,_k,_s,cb)=>{callbacks=cb;cb.onStitchStart();await new Promise<void>(r=>{finish=r;});});
  const {result}=renderHook(()=>usePipeline(keys));let first: Promise<void>;
  act(()=>{first=result.current.startPipeline(params,6,switches);});
  act(()=>result.current.cancelPipeline());expect(result.current.pipelineState.status).toBe('error');
  vi.mocked(runPipeline).mockImplementationOnce(async(_p,_d,_k,_s,cb)=>{cb.onStitchComplete('/outputs/new.mp4');});
  await act(()=>result.current.startPipeline(params,6,switches));
  await act(async()=>{callbacks.onStitchComplete('/outputs/stale.mp4');finish();await first;});
  expect(result.current.pipelineState.stitchedUrl).toBe('/outputs/new.mp4');expect(result.current.pipelineState.status).toBe('complete');
});
