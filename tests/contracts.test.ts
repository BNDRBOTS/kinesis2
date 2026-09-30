import { describe, it, expect } from 'vitest';
import { MODEL_REGISTRY } from '../src/constants';
import { planDurations } from '../src/duration';
import { buildFalInput } from '../src/api/fal';
import { buildReplicateInput } from '../src/api/replicate';
import { buildRunwayInput } from '../src/api/runway';
import { buildLumaInput } from '../src/api/luma';
import type { GenerationParams } from '../src/types';
export const params = (id: string): GenerationParams => {
  const model = MODEL_REGISTRY.find(m => m.id === id)!;
  return { model, prompt: 'A slow camera pan', negativePrompt: 'blur', durationSeconds: model.durations?.includes(3) ? 3 : model.durations?.[0] || 3, aspectRatio: model.aspectRatios[0], seed: 42, cfgScale: .5, imageUrl: 'https://v3.fal.media/input.png' };
};
describe('authoritative duration planner', () => {
  it('honors requested clip duration and remainder', () => {
    expect(planDurations(8, 3, {maxDurationSeconds:10})).toEqual([3,3,2]);
    expect(planDurations(15, 10, {maxDurationSeconds:10})).toEqual([10,5]);
    expect(planDurations(15, 10, {maxDurationSeconds:10,durations:[6,8,10]})).toEqual([10,6]);
    expect(() => planDurations(0, 3, {maxDurationSeconds:10})).toThrow();
  });
  it.each(MODEL_REGISTRY)('$id never produces unsupported calls', model => {
    for (const target of [1,8,15,60]) for (const clip of [3,5,10]) {
      const plan = planDurations(target, clip, model);
      expect(plan.reduce((a,b)=>a+b,0)).toBeGreaterThanOrEqual(target);
      for (const d of plan) { expect(d).toBeLessThanOrEqual(model.maxDurationSeconds); if (model.durations) expect(model.durations).toContain(d); }
    }
  });
});
describe('real payload builders', () => {
  it.each(MODEL_REGISTRY.filter(m=>m.provider==='fal'))('$id supported schema fields', model => {
    const p = params(model.id), input = buildFalInput(p);
    expect(input.prompt).toBe(p.prompt);
    expect(input.image_url || input.start_image_url).toBe(p.imageUrl);
    expect(input.seed).toBe(model.supportsSeed ? 42 : undefined);
    expect(input.negative_prompt).toBe(model.supportsNegativePrompt ? 'blur' : undefined);
    if (model.endpoint.includes('ltx-2') && !model.endpoint.includes('22b')) {
      expect(input).toEqual({prompt:p.prompt,image_url:p.imageUrl,duration:6,resolution:'1080p',aspect_ratio:p.aspectRatio,fps:25,generate_audio:true});
      expect(() => buildFalInput({...p,durationSeconds:5})).toThrow('duration');
    }
    if (model.endpoint.includes('22b')) { expect(input.num_frames).toBe(73); expect(input.video_size).toEqual({width:1280,height:704}); }
    if (model.endpoint.includes('/wan/')) { expect(input.num_frames).toBe(49); expect(input.duration).toBeUndefined(); }
    if (model.endpoint.includes('hunyuan')) { expect(input.num_frames).toBe(73); expect(input.fps).toBeUndefined(); }
    if (model.endpoint.includes('kling')) { expect(typeof input.duration).toBe('string'); expect(input.aspect_ratio).toBeUndefined(); }
  });
  it('Replicate model-specific fields', () => {
    expect(buildReplicateInput(params('replicate-minimax-video-01'))).not.toHaveProperty('duration');
    expect(buildReplicateInput(params('replicate-wan-2.1-720p-i2v'))).not.toHaveProperty('num_frames');
    expect(buildReplicateInput(params('replicate-wan-2.7-i2v'))).toHaveProperty('first_frame');
  });
  it('Runway and Luma payloads', () => {
    expect(buildRunwayInput(params('runway-gen4-turbo'))).toMatchObject({ratio:'1280:720',seed:42,model:'gen4_turbo'});
    expect(buildRunwayInput(params('runway-gen4.5'))).not.toHaveProperty('watermark');
    expect(buildLumaInput(params('luma-ray2-flash'))).toMatchObject({model:'ray-flash-2',duration:'5s'});
  });
});
