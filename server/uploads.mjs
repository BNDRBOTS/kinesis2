import express from 'express';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
export const sharedDir = () => path.join(process.env.MEDIA_DIR || path.resolve('.media'), 'shared');
// Opaque, expiring image URLs can be fetched by providers without the studio password.
export function installPublicImages(app) {
  app.get('/shared/:file', async (req, res) => {
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(req.params.file)) return res.sendStatus(404);
    const file = path.join(sharedDir(), req.params.file);
    try {
      if (Date.now() - (await stat(file)).mtimeMs > 86400000) return res.sendStatus(410);
      res.setHeader('Cache-Control', 'private, max-age=3600');res.setHeader('X-Content-Type-Options', 'nosniff');
      res.sendFile(file);
    } catch { res.sendStatus(404); }
  });
}
export function installUploads(app) {
  app.post('/api/upload', express.raw({type:()=>true,limit:'20mb'}), async (req,res) => {
    const base = process.env.PUBLIC_BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');
    if (!base.startsWith('https://')) return res.status(503).json({error:'Set PUBLIC_BASE_URL or Railway public domain to host images for Luma'});
    const ext = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[req.headers['content-type']];
    if (!ext || !req.body?.length || req.body.length > 20_000_000) return res.status(400).json({error:'Expected PNG, JPEG or WebP bytes'});
    const name = randomUUID()+'.'+ext;
    await mkdir(sharedDir(),{recursive:true});await writeFile(path.join(sharedDir(),name),req.body);
    res.json({url:base.replace(/\/$/,'')+'/shared/'+name});
  });
}
