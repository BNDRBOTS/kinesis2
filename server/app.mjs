import { installImages } from './images.mjs';
import { installComfyCloud } from './comfy-cloud.mjs';
import { installPublicImages, installUploads } from './uploads.mjs';
import { installMedia } from './media.mjs';
import { createHash } from 'node:crypto';
import express from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { readFileSync } from 'node:fs';
import { createFalClient } from '@fal-ai/client';

const mediaHosts = ['fal.media', 'replicate.delivery', 'cdn-luma.com', 'runwayml.com', 'storage.googleapis.com', 'assets.mixkit.co', 'images.unsplash.com'];
export function allowedMedia(value) {
  try {
    const u = new URL(value);
    if (process.env.COMFYUI_MEDIA_ORIGIN && u.origin === process.env.COMFYUI_MEDIA_ORIGIN && u.pathname === '/view') return u.protocol === 'https:' && !u.username && !u.password;
    return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') && mediaHosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch { return false; }
}
const source = readFileSync(new URL('../src/constants.ts', import.meta.url), 'utf8');
const endpoints = [...source.matchAll(/endpoint:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
endpoints.push('fal-ai/mmaudio-v2', 'fal-ai/topaz/upscale/video');
const roots = new Set(endpoints.filter(x => x.includes('/')).map(x => x.split('/').slice(0, 2).join('/')));
const providers = {
  fal: { origin: 'https://queue.fal.run', env: 'FAL_KEY', prefix: 'Key', valid: p => endpoints.includes(p.slice(1)) || /^\/[\w.-]+\/[\w.-]+\/requests\/[\w-]+(?:\/status|\/cancel)?(?:\?logs=true)?$/.test(p) && roots.has(p.split('/').slice(1, 3).join('/')) },
  replicate: { origin: 'https://api.replicate.com', env: 'REPLICATE_API_TOKEN', prefix: 'Bearer', valid: p => /^\/v1\/predictions\/[\w-]+(?:\/cancel)?$/.test(p) || p === '/v1/files' || endpoints.some(e => p === `/v1/models/${e}/predictions`) },
  runway: { origin: 'https://api.dev.runwayml.com', env: 'RUNWAYML_API_SECRET', prefix: 'Bearer', valid: p => p === '/v1/image_to_video' || /^\/v1\/tasks\/[\w-]+$/.test(p) },
  luma: { origin: 'https://api.lumalabs.ai', env: 'LUMA_API_KEY', prefix: 'Bearer', valid: p => /^\/dream-machine\/v1\/generations(?:\/[\w-]+)?$/.test(p) },
};
export function createApp({ upstream = fetch, upload } = {}) {
  const app = express();
  app.disable('x-powered-by');
  installPublicImages(app);
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // A private, single-user deployment may use server-managed credentials.
    // Never spend server credentials on an unauthenticated public deployment.
    if (process.env.APP_PASSWORD) {
      const cookie = req.headers.cookie?.split('; ').find(c => c.startsWith('kinesis_auth='))?.slice(13);
      const expected = Buffer.from(`kinesis:${process.env.APP_PASSWORD}`).toString('base64');
      const basic = req.headers.authorization?.startsWith('Basic ') ? req.headers.authorization.slice(6) : null;
      const session = createHash('sha256').update(expected).digest('hex');
      if (basic !== expected && cookie !== session) {
        res.setHeader('WWW-Authenticate', 'Basic realm="KINESIS"');
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (basic === expected) res.cookie('kinesis_auth', session, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' });
    }
    next();
  });
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Cross-origin API request denied' });
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Range, X-Runway-Version, Prefer, X-Comfy-Key, Idempotency-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, DELETE, PUT, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Length, Content-Range, Accept-Ranges');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.get('/api/config', (_req, res) => res.json({ ...Object.fromEntries(Object.entries(providers).map(([name, p]) => [name, !!(process.env.APP_PASSWORD && process.env[p.env])])), comfyCloud: !!(process.env.APP_PASSWORD && process.env.COMFY_CLOUD_API_KEY) }));
  const signalFor = (req, res) => {
    const c = new AbortController();
    res.on('close', () => { if (!res.writableEnded) c.abort(); });
    return AbortSignal.any([c.signal, AbortSignal.timeout(120_000)]);
  };
  async function forward(response, req, res) {
    res.status(response.status);
    for (const key of ['content-type', 'content-range', 'accept-ranges', 'retry-after', 'etag', 'last-modified']) {
      const value = response.headers.get(key); if (value) res.setHeader(key, value);
    }
    if (!response.headers.has('content-encoding') && response.headers.has('content-length')) res.setHeader('content-length', response.headers.get('content-length'));
    if (req.method === 'HEAD' || !response.body) return res.end();
    await pipeline(Readable.fromWeb(response.body), res);
  }
  app.all('/api/media', async (req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
    if (!allowedMedia(req.query.url)) return res.status(400).json({ error: 'Invalid or disallowed media URL' });
    try {
      const response = await upstream(req.query.url, { method: req.method, headers: { ...(req.headers.range ? { Range: req.headers.range } : {}), ...(req.headers['if-range'] ? { 'If-Range': req.headers['if-range'] } : {}), 'Accept-Encoding': 'identity' }, redirect: 'manual', signal: signalFor(req, res) });
      if (response.status >= 300 && response.status < 400) return res.status(502).json({ error: 'Upstream redirects are not permitted' });
      await forward(response, req, res);
    } catch { if (!res.headersSent) res.status(502).json({ error: 'Media upstream failed' }); }
  });
  app.use('/api/image-edit/cloudflare-klein', express.raw({type:()=>true,limit:'97mb'}), (err,_req,res,_next)=>res.status(err.status || 400).json({error:{code:'invalid_upload',message:err.status===413?'Multipart upload exceeds 97 MiB':'Malformed upload'},provider:'cloudflare'}));
  app.use('/api', express.raw({ type: () => true, limit: '100mb' }));
  installMedia(app, allowedMedia, upstream);
  installUploads(app);
  installComfyCloud(app, upstream);
  installImages(app, upstream);
  app.all('/api/fal-file', async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const key = req.headers.authorization?.startsWith('Key ') ? req.headers.authorization.slice(4) : (process.env.APP_PASSWORD && process.env.FAL_KEY);
    if (!key) return res.status(401).json({ error: 'Fal credentials required' });
    if (!/^(image\/(png|jpeg|webp)|video\/(mp4|webm))$/.test(req.headers['content-type'] || '') || !req.body?.length) return res.status(400).json({ error: 'Expected raw image/video bytes' });
    try {
      const file = new Blob([req.body], { type: req.headers['content-type'] });
      const url = await (upload ? upload(file, key) : createFalClient({ credentials: key, fetch: (url, init) => upstream(url, { ...init, signal: signalFor(req, res) }) }).storage.upload(file));
      res.json({ url });
    } catch { res.status(502).json({ error: 'Fal storage upload failed' }); }
  });
  for (const [name, provider] of Object.entries(providers)) app.all(`/api/${name}`, async (req, res) => {
    if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
    let auth = req.headers.authorization;
    if (!auth || auth.startsWith('Basic ')) auth = process.env.APP_PASSWORD && process.env[provider.env] ? `${provider.prefix} ${process.env[provider.env]}` : null;
    if (!auth || !auth.startsWith(provider.prefix + ' ')) return res.status(401).json({ error: 'Provider credentials required' });
    let target = req.query.targetPath;
    let body = req.body?.length ? req.body : undefined;
    if (req.headers['content-type']?.includes('application/json') && body) {
      try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        const { targetPath, ...rest } = parsed;
        target = targetPath || target;
        body = JSON.stringify(name === 'fal' && rest.input ? rest.input : rest);
      } catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
    }
    if (typeof target !== 'string' || !provider.valid(target) || /[%\\]|\.\./.test(target)) return res.status(400).json({ error: 'Invalid or disallowed targetPath' });
    try {
      const response = await upstream(provider.origin + target, {
        method: req.method, redirect: 'manual', signal: signalFor(req, res),
        headers: { Authorization: auth, ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}), ...(name === 'runway' ? { 'X-Runway-Version': '2024-11-06' } : {}), ...(name === 'replicate' ? { Prefer: 'respond-async' } : {}) },
        body: ['GET', 'DELETE'].includes(req.method) ? undefined : body,
      });
      await forward(response, req, res);
    } catch { if (!res.headersSent) res.status(502).json({ error: 'Provider upstream failed' }); }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));
  app.use(express.static(new URL('../dist', import.meta.url).pathname));
  app.get('/{*path}', (_req, res) => res.sendFile(new URL('../dist/index.html', import.meta.url).pathname));
  app.use((err, _req, res, _next) => { if (!res.headersSent) res.status(err.status || 500).json({ error: err.status === 413 ? 'Request too large' : 'Request failed' }); });
  return app;
}
