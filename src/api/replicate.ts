import type { GenerationParams } from '../types';
import { providerRequest, pollProvider } from './proxy';

export function buildReplicateInput(p: GenerationParams): Record<string, unknown> {
  const input: Record<string, unknown> = { prompt: p.prompt };
  if (p.model.supportsSeed && p.seed !== null) input.seed = p.seed;
  if (p.model.supportsNegativePrompt) input.negative_prompt = p.negativePrompt;
  switch (p.model.endpoint) {
    case 'minimax/video-01': input.first_frame_image = p.imageUrl; break;
    case 'wavespeedai/wan-2.1-i2v-720p': Object.assign(input, { image: p.imageUrl, aspect_ratio: p.aspectRatio }); break;
    case 'wan-video/wan-2.7-i2v': Object.assign(input, { first_frame: p.imageUrl, duration: p.durationSeconds, resolution: '1080p' }); break;
    default: throw new Error('Unsupported Replicate model');
  }
  return input;
}
export async function submitReplicateJob(p: GenerationParams, key: string, signal?: AbortSignal) {
  const data = await providerRequest('replicate', `/v1/models/${p.model.endpoint}/predictions`, key, 'POST', { input: buildReplicateInput(p) }, signal);
  if (!data.id) throw new Error('Replicate returned no prediction ID');
  return { predictionId: data.id as string };
}
export function pollReplicateJob(id: string, key: string, progress?: (msg: string) => void, signal?: AbortSignal) {
  return pollProvider('replicate', `/v1/predictions/${id}`, key, data => {
    if (['failed','canceled'].includes(data.status)) throw new Error(data.error || `Replicate ${data.status}`);
    if (data.status === 'succeeded') {
      const url = typeof data.output === 'string' ? data.output : data.output?.[0];
      if (!url) throw new Error('Replicate succeeded without output');
      return url;
    }
  }, progress, signal, `/v1/predictions/${id}/cancel`);
}
