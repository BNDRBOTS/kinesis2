import type { GenerationParams } from '../types';
import { providerRequest, pollProvider } from './proxy';
export function buildRunwayInput(p: GenerationParams) {
  if (p.model.endpoint === 'gen3a_turbo') throw new Error('Gen-3 Alpha Turbo is retired. Select Gen-4 Turbo.');
  const ratio = p.aspectRatio === '16:9' ? '1280:720' : p.aspectRatio === '9:16' ? '720:1280' : p.aspectRatio;
  return { model: p.model.endpoint, promptImage: p.imageUrl, promptText: p.prompt.slice(0, 1000), duration: p.durationSeconds, ratio, ...(p.seed !== null ? { seed: p.seed } : {}) };
}
export async function submitRunwayJob(p: GenerationParams, key: string, signal?: AbortSignal) {
  const data = await providerRequest('runway', '/v1/image_to_video', key, 'POST', buildRunwayInput(p), signal);
  if (!data.id) throw new Error('Runway returned no task ID');
  return { taskId: data.id as string };
}
export function pollRunwayJob(id: string, key: string, progress?: (msg: string) => void, signal?: AbortSignal) {
  return pollProvider('runway', `/v1/tasks/${id}`, key, data => {
    if (['FAILED','CANCELLED'].includes(data.status)) throw new Error(data.failure || `Runway ${data.status}`);
    if (data.status === 'SUCCEEDED') {
      if (!data.output?.[0]) throw new Error('Runway succeeded without output');
      return data.output[0];
    }
  }, progress, signal, `/v1/tasks/${id}`, 'DELETE');
}
