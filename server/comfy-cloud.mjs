import { mkdir, rename, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const CLOUD_ORIGIN = 'https://cloud.comfy.org';
const id = '[a-f0-9-]{36}';
export function cloudPath(value, method) {
  if (typeof value !== 'string') return null;
  const u = new URL(value, CLOUD_ORIGIN);
  if (u.origin !== CLOUD_ORIGIN || u.username || u.password || u.search || u.hash) return null;
  const allowed = method === 'POST' ? new RegExp(`^/api/v2/(assets|jobs|jobs/${id}/cancel)$`, 'i') : new RegExp(`^/api/v2/(jobs/${id}|assets/${id}/content)$`, 'i');
  return allowed.test(u.pathname) ? u.pathname : null;
}
// Only follow Cloud-issued storage redirects, never user-provided download URLs.
export function cloudStorageUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') &&
      ['storage.googleapis.com', 'amazonaws.com', 'r2.cloudflarestorage.com', 'comfy.org'].some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
}
export function installComfyCloud(app, upstream) {
  app.all('/api/comfy-cloud', async (req, res) => {
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
    const key = req.headers['x-comfy-key'] || (process.env.APP_PASSWORD && process.env.COMFY_CLOUD_API_KEY);
    if (!key || typeof key !== 'string') return res.status(401).json({ error: 'Comfy Cloud API key required' });
    let target;
    try { target = cloudPath(req.query.targetPath, req.method); } catch { /* invalid URL */ }
    if (!target) return res.status(400).json({ error: 'Invalid Comfy Cloud target' });
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]);
    let temp;
    try {
      let body = req.body?.length ? req.body : undefined;
      const headers = { Authorization: `Bearer ${key}` };
      if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
      if (req.headers['idempotency-key']) headers['Idempotency-Key'] = req.headers['idempotency-key'];
      if (req.method === 'POST' && target === '/api/v2/jobs') {
        let parsed;
        try { parsed = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
        if (!parsed?.workflow || typeof parsed.workflow !== 'object' || Array.isArray(parsed.workflow) || parsed.workflow.nodes) return res.status(400).json({ error: 'Expected API-format workflow' });
        // Inject partner-node authentication only on the backend; never trust extra client fields.
        body = JSON.stringify({ workflow: parsed.workflow, extra_data: { api_key_comfy_org: key } });
      }
      let response = await upstream(CLOUD_ORIGIN + target, { method: req.method, headers, body: req.method === 'POST' ? body : undefined, redirect: 'manual', signal });
      if (!target.endsWith('/content') || (!response.ok && response.status !== 302)) {
        if (response.status >= 300 && response.status < 400) return res.status(502).json({ error: 'Unexpected Cloud API redirect' });
        const retry = response.headers.get('retry-after'); if (retry) res.setHeader('Retry-After', retry);
        const text = (await response.text()).split(key).join('[redacted]');
        return res.status(response.status).type('application/json').send(text);
      }
      // Authenticated output endpoints return 302 to short-lived storage URLs.
      if (response.status === 302) {
        const location = response.headers.get('location');
        if (!cloudStorageUrl(location)) throw new Error('Cloud returned an unsupported storage host; download denied');
        response = await upstream(location, { method: 'GET', redirect: 'error', signal }); // NO API key on storage requests
      }
      if (!response.ok) throw new Error(`Cloud output download failed: HTTP ${response.status}`);
      const mime = response.headers.get('content-type')?.split(';')[0];
      const ext = { 'video/mp4': 'mp4', 'video/webm': 'webm' }[mime];
      if (!ext) throw new Error('Cloud output is not MP4/WebM video');
      if (Number(response.headers.get('content-length')) > 250_000_000) throw new Error('Cloud output exceeds 250 MB');
      const dir = process.env.MEDIA_DIR || path.resolve('.media'); await mkdir(dir, { recursive: true });
      const name = `${randomUUID()}.${ext}`; temp = path.join(dir, name + '.part');
      let size = 0;
      await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _encoding, callback) {
        size += chunk.length; callback(size > 250_000_000 ? new Error('Cloud output exceeds 250 MB') : null, chunk);
      } }), createWriteStream(temp), { signal });
      signal.throwIfAborted();
      await rename(temp, path.join(dir, name)); temp = undefined;
      res.json({ url: '/outputs/' + name });
    } catch (err) {
      if (!res.headersSent && !res.destroyed) res.status(502).json({ error: err.message?.split(key).join('[redacted]') || 'Comfy Cloud upstream failed' });
    } finally { if (temp) await rm(temp, { force: true }); }
  });
}
