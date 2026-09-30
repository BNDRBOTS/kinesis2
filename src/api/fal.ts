import type { GenerationParams } from '../types';
import { apiFetch, sleep } from './helpers';
import { POLL_INTERVAL_BASE_MS, POLL_MAX_ATTEMPTS } from '../constants';

const FAL_PROXY = '/api/fal';
export function buildFalInput(p: GenerationParams): Record<string, unknown> {
  const e = p.model.endpoint;
  if (!p.prompt.trim()) throw new Error('A prompt is required');
  if (!p.model.aspectRatios.includes(p.aspectRatio)) throw new Error('Unsupported aspect ratio');
  if (!(p.durationSeconds > 0 && p.durationSeconds <= p.model.maxDurationSeconds) || p.model.durations && !p.model.durations.includes(p.durationSeconds)) throw new Error('Unsupported model duration');
  if (p.model.supportsSeed && p.seed !== null && (!Number.isInteger(p.seed) || p.seed < 0 || p.seed > 2147483647)) throw new Error('Seed must be an integer between 0 and 2147483647');
  const input: Record<string, unknown> = { prompt: p.prompt };
  if (p.model.supportsSeed && p.seed !== null) input.seed = p.seed;
  if (p.model.supportsNegativePrompt && p.negativePrompt) input.negative_prompt = p.negativePrompt;
  if (e.includes('kling-video')) {
    input[e.includes('/v3/') || e.includes('/v2.6/') ? 'start_image_url' : 'image_url'] = p.imageUrl;
    input.duration = String(p.durationSeconds);
    if (e.includes('/v3/') || e.includes('/v2/')) input.cfg_scale = p.cfgScale;
    if (p.model.nativeAudio) input.generate_audio = true;
    return input;
  }
  input.image_url = p.imageUrl;
  if (e.includes('ltx-2.3-22b')) {
    Object.assign(input, { num_frames: Math.min(481, Math.floor(p.durationSeconds * 24 / 8) * 8 + 1), fps: 24, video_size: p.aspectRatio === '9:16' ? { width: 704, height: 1280 } : { width: 1280, height: 704 }, generate_audio: true });
  } else if (e.includes('ltx-2')) {
    Object.assign(input, { duration: p.durationSeconds, resolution: '1080p', aspect_ratio: p.aspectRatio, fps: 25, generate_audio: true });
  } else if (e.includes('13b-distilled')) {
    Object.assign(input, { num_frames: Math.floor(p.durationSeconds * 24 / 8) * 8 + 1, frame_rate: 24, resolution: '720p', aspect_ratio: p.aspectRatio });
  } else if (e.includes('/wan/')) {
    Object.assign(input, { num_frames: Math.min(161, Math.round(p.durationSeconds * 16) + 1), frames_per_second: 16, resolution: '720p', aspect_ratio: p.aspectRatio, interpolator_model: 'none' });
  } else if (e.includes('hunyuan-video-v1.5')) {
    Object.assign(input, { num_frames: Math.min(121, Math.round(p.durationSeconds * 24) + 1), resolution: '480p', aspect_ratio: p.aspectRatio });
  } else if (e !== 'fal-ai/ltx-video/image-to-video') throw new Error(`No request builder for ${e}`);
  return input;
}
function queuePath(value: string): string {
  if (value.startsWith('/')) return value;
  const url = new URL(value);
  if (url.origin !== 'https://queue.fal.run') throw new Error('Untrusted Fal queue URL');
  return url.pathname + url.search;
}
async function falRequest(path: string, apiKey: string, method: string, body?: unknown, signal?: AbortSignal) {
  const headers: Record<string,string> = { 'Content-Type': 'application/json' };
  if (apiKey && apiKey !== 'server-managed') headers.Authorization = `Key ${apiKey}`;
  const response = await apiFetch(`${FAL_PROXY}?targetPath=${encodeURIComponent(queuePath(path))}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  return response.json();
}
async function submit(endpoint: string, input: Record<string, unknown>, key: string, signal?: AbortSignal) {
  const data = await falRequest('/' + endpoint, key, 'POST', input, signal);
  if (!data.request_id) throw new Error('Fal returned no request_id');
  const root = endpoint.split('/').slice(0, 2).join('/');
  return { requestId: data.request_id as string, statusUrl: data.status_url || `https://queue.fal.run/${root}/requests/${data.request_id}/status`, responseUrl: data.response_url || `https://queue.fal.run/${root}/requests/${data.request_id}` };
}
export function submitFalJob(params: GenerationParams, apiKey: string, signal?: AbortSignal) {
  return submit(params.model.endpoint, buildFalInput(params), apiKey, signal);
}
export async function pollFalJob(statusUrl: string, responseUrl: string, apiKey: string, onProgress?: (msg: string) => void, signal?: AbortSignal): Promise<string> {
  const cancel = () => { void falRequest(queuePath(responseUrl) + '/cancel', apiKey, 'PUT').catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      await sleep(POLL_INTERVAL_BASE_MS, signal);
      const status = await falRequest(statusUrl, apiKey, 'GET', undefined, signal);
      onProgress?.(status.status);
      if (status.status === 'COMPLETED') {
        const result = await falRequest(responseUrl, apiKey, 'GET', undefined, signal);
        if (!result.video?.url) throw new Error('Fal completed without a video URL');
        return result.video.url;
      }
      if (['FAILED', 'CANCELLED'].includes(status.status)) throw new Error(`Fal generation ${status.status}`);
    }
    throw new Error('Fal polling timed out');
  } finally { signal?.removeEventListener('abort', cancel); }
}
export async function generateFalFoleyAudio(videoUrl: string, prompt: string, apiKey: string, onProgress?: (msg: string) => void, signal?: AbortSignal, duration = 8): Promise<string> {
  if (duration > 30) throw new Error('MMAudio supports up to 30 seconds; base video is retained');
  const job = await submit('fal-ai/mmaudio-v2', { video_url: videoUrl, prompt: prompt || 'Natural synchronized sound effects', duration: Math.max(1, duration) }, apiKey, signal);
  // MMAudio returns an MP4 with sound, not an MP3 audio file.
  return pollFalJob(job.statusUrl, job.responseUrl, apiKey, onProgress, signal);
}
export async function upscaleFalVideo(videoUrl: string, apiKey: string, onProgress?: (msg: string) => void, signal?: AbortSignal): Promise<string> {
  const job = await submit('fal-ai/topaz/upscale/video', { video_url: videoUrl, upscale_factor: 2, model: 'Proteus', H264_output: true }, apiKey, signal);
  return pollFalJob(job.statusUrl, job.responseUrl, apiKey, onProgress, signal);
}
