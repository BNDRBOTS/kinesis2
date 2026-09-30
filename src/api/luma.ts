import type { GenerationParams } from '../types';
import { providerRequest, pollProvider } from './proxy';
export function buildLumaInput(p: GenerationParams) {
  return { prompt: p.prompt, model: p.model.endpoint === 'ray-2' ? 'ray-2' : 'ray-flash-2', resolution: p.model.endpoint === 'ray-2' ? '1080p' : '720p', duration: `${p.durationSeconds}s`, aspect_ratio: p.aspectRatio, keyframes: { frame0: { type: 'image', url: p.imageUrl } } };
}
export async function submitLumaJob(p: GenerationParams, key: string, signal?: AbortSignal) {
  const data = await providerRequest('luma', '/dream-machine/v1/generations', key, 'POST', buildLumaInput(p), signal);
  if (!data.id) throw new Error('Luma returned no generation ID');
  return { generationId: data.id as string };
}
export function pollLumaJob(id: string, key: string, progress?: (msg: string) => void, signal?: AbortSignal) {
  return pollProvider('luma', `/dream-machine/v1/generations/${id}`, key, data => {
    if (data.state === 'failed') throw new Error(data.failure_reason || 'Luma generation failed');
    if (data.state === 'completed') {
      if (!data.assets?.video) throw new Error('Luma completed without video');
      return data.assets.video;
    }
  }, progress, signal);
}
