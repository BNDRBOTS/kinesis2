import type { GenerationParams } from '../types';
import { buildComfyWorkflow, validateWorkflow, type WorkflowTemplate } from './comfyui';
import { apiFetch, getProxiedMediaUrl, sleep } from './helpers';

interface CloudJob {
  id: string;
  status: 'queued' | 'running' | 'canceling' | 'canceled' | 'failed' | 'expired' | 'succeeded';
  urls: { self: string; cancel: string };
  progress?: { message?: string; value: number };
  outputs: Array<{ id: string; content_type: string; url: string; node_id: string }>;
  error?: { code: string; message: string; node_errors?: unknown };
}
const ORIGIN = 'https://cloud.comfy.org';
function endpoint(link: string) {
  const u = new URL(link, ORIGIN);
  if (u.origin !== ORIGIN || u.search || u.hash || u.username || u.password || !/^\/api\/v2\/(assets|jobs)(?:\/[a-f0-9-]{36}(?:\/(cancel|content))?)?$/i.test(u.pathname)) throw new Error('Invalid Comfy Cloud response link');
  return `/api/comfy-cloud?targetPath=${encodeURIComponent(u.pathname)}`;
}
async function request(link: string, key: string, method: string, body?: BodyInit, signal?: AbortSignal, json = false) {
  // Never blindly retry submissions: v2 idempotency is reject-on-duplicate, not response replay.
  const headers: Record<string, string> = key && key !== 'server-managed' ? { 'X-Comfy-Key': key } : {};
  if (json) headers['Content-Type'] = 'application/json';
  if (method === 'POST' && !link.endsWith('/cancel')) headers['Idempotency-Key'] = crypto.randomUUID();
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(endpoint(link), { method, body, headers, signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(120_000)]) });
    if (response.ok) return response.json();
    // A definite 429 creates no job. Retry with the SAME idempotency key, bounded and cancelable.
    if (response.status === 429 && attempt < 3) {
      const retry = response.headers.get('retry-after');
      const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000 : retry ? Date.parse(retry) - Date.now() : 3000;
      await sleep(Math.max(1000, Math.min(Number.isFinite(delay) ? delay : 3000, 60_000)), signal); continue;
    }
    const detail = (await response.text()).slice(0, 2000);
    throw new Error(`Comfy Cloud HTTP ${response.status}: ${detail}${method === 'POST' && response.status >= 500 ? ' Submission outcome may be unknown; check Cloud jobs before resubmitting.' : ''}`);
  }
}
export async function runComfyCloud(p: GenerationParams, key: string, progress?: (message: string) => void, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if (!key) throw new Error('Configure COMFY_CLOUD_API_KEY on the KINESIS server or enter a Comfy Cloud key.');
  const raw = localStorage.getItem(`kinesis_workflow_${p.model.endpoint}`);
  if (!raw) throw new Error('Import a Cloud-tested API workflow with KINESIS input bindings for Comfy Cloud.');
  const template = JSON.parse(raw) as WorkflowTemplate; validateWorkflow(template);
  const blob = await (await apiFetch(getProxiedMediaUrl(p.imageUrl), { method: 'GET', signal })).blob();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) throw new Error('Comfy Cloud input must be PNG, JPEG or WebP');
  const filePath = `kinesis-${crypto.randomUUID()}.${blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1]}`;
  const form = new FormData(); form.append('file', blob, filePath); form.append('content_type', blob.type); form.append('file_path', filePath);
  const asset = await request('/api/v2/assets', key, 'POST', form, signal);
  if (!asset.id) throw new Error('Comfy Cloud upload returned no asset ID');
  const workflow = buildComfyWorkflow(template, p, { __type: 'core/ASSET', info: { id: asset.id } });
  let job: CloudJob = await request('/api/v2/jobs', key, 'POST', JSON.stringify({ workflow }), signal, true);
  if (!job.id || !job.urls?.self || !job.urls?.cancel) throw new Error('Comfy Cloud submission returned no job links');
  let cancelRequested = false;
  const cancel = async () => {
    if (cancelRequested) return;
    cancelRequested = true;
    try { await request(job.urls.cancel, key, 'POST'); progress?.('Comfy Cloud cancellation requested; GPU work stops at a node/step boundary.'); }
    catch { progress?.(`Cloud cancellation could not be confirmed. Check job ${job.id} in Comfy Cloud.`); }
  };
  const onAbort = () => { void cancel(); };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    if (signal?.aborted) { await cancel(); signal.throwIfAborted(); }
    // Allows the Pro 60-minute execution cap plus queue time; never an infinite poll.
    const deadline = Date.now() + 90 * 60_000;
    while (Date.now() < deadline) {
      signal?.throwIfAborted();
      progress?.(`Comfy Cloud ${job.id}: ${job.status}${job.progress?.message ? ' — ' + job.progress.message : ''}`);
      if (['failed', 'canceled', 'expired'].includes(job.status)) throw new Error(`Comfy Cloud ${job.status}: ${JSON.stringify(job.error || {})}`);
      if (job.status === 'succeeded') {
        const output = job.outputs?.find(o => ['video/mp4', 'video/webm'].includes(o.content_type) && (!template.outputNode || o.node_id === template.outputNode));
        if (!output) throw new Error('Comfy Cloud completed without the selected MP4/WebM output');
        const cached = await request(output.url, key, 'GET', undefined, signal);
        if (!/^\/outputs\/[a-f0-9-]{36}\.(mp4|webm)$/.test(cached.url)) throw new Error('Cloud output download returned no local video');
        return cached.url;
      }
      if (!['queued', 'running', 'canceling'].includes(job.status)) throw new Error(`Unknown Comfy Cloud status: ${job.status}`);
      await sleep(3000, signal);
      job = await request(job.urls.self, key, 'GET', undefined, signal);
    }
    await cancel(); throw new Error('Comfy Cloud polling timed out; cancellation requested');
  } catch (error) {
    if (!['succeeded', 'failed', 'canceled', 'expired'].includes(job.status)) await cancel();
    throw error;
  } finally { signal?.removeEventListener('abort', onAbort); }
}
