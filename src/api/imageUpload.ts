import type { Provider, ApiKeys } from '../types';
import { apiFetch, fileToDataUrl, getProxiedMediaUrl } from './helpers';

export async function uploadToFal(url: string, apiKey: string, signal?: AbortSignal): Promise<string> {
  const response = await apiFetch(getProxiedMediaUrl(url), { method: 'GET', signal });
  const blob = await response.blob();
  const uploaded = await apiFetch('/api/fal-file', {
    method: 'POST', signal,
    headers: { 'Content-Type': blob.type.split(';')[0], ...(apiKey && apiKey !== 'server-managed' ? { Authorization: `Key ${apiKey}` } : {}) },
    body: blob,
  });
  const result = await uploaded.json();
  if (!result.url?.startsWith('https://')) throw new Error('Upload did not return a hosted URL');
  return result.url;
}
export async function ensureImageUrl(imageUrl: string, provider: Provider, apiKeys: ApiKeys, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if (imageUrl.startsWith('https://') || provider === 'comfyui' || provider === 'comfyCloud') return imageUrl;
  if (!imageUrl.startsWith('data:image/') && !imageUrl.startsWith('blob:')) throw new Error('Expected an HTTPS image or local upload');
  if (provider === 'fal') return uploadToFal(imageUrl, apiKeys.fal, signal);
  if (provider === 'runway' || provider === 'replicate') {
    const data = imageUrl.startsWith('data:') ? imageUrl : await fileToDataUrl(await (await apiFetch(imageUrl, { method: 'GET', signal })).blob());
    if (provider === 'runway' && data.length > 5242880) {
      if (apiKeys.fal) return uploadToFal(data, apiKeys.fal, signal);
      throw new Error('Runway data URI exceeds 5 MB; use a smaller image or configure Fal storage');
    }
    return data;
  }
  if (apiKeys.fal) return uploadToFal(imageUrl, apiKeys.fal, signal);
  if (apiKeys.replicate) {
    const blob = await (await apiFetch(imageUrl, { method: 'GET', signal })).blob();
    const form = new FormData(); form.append('content', blob, 'frame.png');
    const result = await (await apiFetch('/api/replicate?targetPath=%2Fv1%2Ffiles', { method: 'POST', headers: apiKeys.replicate !== 'server-managed' ? { Authorization: `Bearer ${apiKeys.replicate}` } : {}, body: form, signal })).json();
    if (result.urls?.get) return result.urls.get;
  }
  const blob = await (await apiFetch(imageUrl, { method: 'GET', signal })).blob();
  const hosted = await (await apiFetch('/api/upload', { method: 'POST', signal, headers: { 'Content-Type': blob.type }, body: blob })).json();
  if (!hosted.url?.startsWith('https://')) throw new Error('Image hosting returned no public URL');
  return hosted.url;
}

/** Models with image-derived geometry must receive an image matching the UI ratio. */
export async function prepareModelImage(params: import('../types').GenerationParams, signal?: AbortSignal): Promise<string> {
  const endpoint = params.model.endpoint;
  const fixed = endpoint === 'fal-ai/ltx-video/image-to-video';
  if (!fixed && !endpoint.includes('kling-video') && !endpoint.includes('minimax')) return params.imageUrl;
  const blob = await (await apiFetch(getProxiedMediaUrl(params.imageUrl), { method:'GET', signal })).blob();
  const image = await createImageBitmap(blob);
  try {
    signal?.throwIfAborted();
    const [w,h] = params.aspectRatio.split(':').map(Number);
    const ratio = fixed ? 1.5 : w/h;
    const sourceWidth = Math.min(image.width, image.height * ratio);
    const sourceHeight = sourceWidth / ratio;
    const canvas = document.createElement('canvas');
    canvas.width = fixed ? 768 : Math.round(Math.min(1920, sourceWidth));
    canvas.height = fixed ? 512 : Math.round(canvas.width / ratio);
    const ctx = canvas.getContext('2d');if (!ctx) throw new Error('Image conversion unavailable');
    ctx.drawImage(image,(image.width-sourceWidth)/2,(image.height-sourceHeight)/2,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/png');
  } finally { image.close(); }
}
