import { mkdtemp, rm, writeFile, readFile, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import ffprobe from '@ffprobe-installer/ffprobe';
import express from 'express';

export function command(bin, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { signal, env: {}, cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', error = '';
    child.stdout.on('data', d => { output += d; });
    child.stderr.on('data', d => { error = (error + d).slice(-4000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`Media processing failed: ${error}`)));
  });
}
export function installMedia(app, allowedMedia, upstream) {
  const outputDir = process.env.MEDIA_DIR || path.resolve('.media');
  app.use('/outputs', express.static(outputDir, { dotfiles: 'deny', fallthrough: false }));
  let active = 0;
  app.post('/api/process', async (req, res) => {
    let body;
    try { body = JSON.parse(req.body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    if (!body || !['frame', 'stitch', 'cache'].includes(body.operation) || !Array.isArray(body.urls) || !body.urls.length || body.urls.length > 60 || body.urls.some(u => typeof u !== 'string' || (!allowedMedia(u) && !/^\/outputs\/[a-f0-9-]{36}\.(mp4|webm)$/.test(u)))) return res.status(400).json({ error: 'Invalid operation or media URLs' });
    if (active >= 2) return res.status(429).json({ error: 'Media worker busy; try again shortly' });
    active++;
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(600_000)]);
    let temp;
    try {
      temp = await mkdtemp(path.join(tmpdir(), 'kinesis-'));
      const files = [];
      let totalBytes = 0;
      for (let i = 0; i < body.urls.length; i++) {
        if (body.urls[i].startsWith('/outputs/')) {
          const file = path.join(temp, `${i}.mp4`);
          await copyFile(path.join(outputDir, path.basename(body.urls[i])), file);files.push(file);continue;
        }
        const response = await upstream(body.urls[i], { signal, redirect: 'error' });
        if (!response.ok || Number(response.headers.get('content-length')) > 250_000_000) throw new Error('Media download failed or exceeded 250 MB');
        let size = 0; const chunks = [];
        for await (const chunk of response.body) {
          size += chunk.length; totalBytes += chunk.length;
          if (totalBytes > 500_000_000) throw new Error("Sequence download exceeds 500 MB");
          if (size > 250_000_000) throw new Error('Media exceeds 250 MB');
          chunks.push(chunk);
        }
        const file = path.join(temp, `${i}.mp4`);
        await writeFile(file, Buffer.concat(chunks));
        files.push(file);
      }
      if (body.operation === 'frame') {
        const frame = path.join(temp, 'frame.png');
        await command(ffmpeg.path, ['-v','error','-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm','-sseof','-3','-i',files[0],'-vf','reverse','-frames:v','1',frame], signal);
        return res.json({ url: 'data:image/png;base64,' + (await readFile(frame)).toString('base64') });
      }
      const metadata = JSON.parse(await command(ffprobe.path, ['-v','quiet','-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm','-print_format','json','-show_streams',files[0]], signal));
      const video = metadata.streams.find(s => s.codec_type === 'video');
      if (!video || video.width > 4096 || video.height > 4096) throw new Error('Missing video stream or dimensions exceed 4096 pixels');
      const width = Math.floor(video.width / 2) * 2, height = Math.floor(video.height / 2) * 2;
      for (let i = 0; i < files.length; i++) {
        const probe = JSON.parse(await command(ffprobe.path, ['-v','quiet','-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm','-print_format','json','-show_streams',files[i]], signal));
        const hasAudio = probe.streams.some(s => s.codec_type === 'audio');
        const normalized = path.join(temp, `normalized-${i}.mp4`);
        await command(ffmpeg.path, ['-v','error','-protocol_whitelist','file,pipe','-format_whitelist','mov,matroska,webm','-i',files[i], ...(!hasAudio ? ['-f','lavfi','-i','anullsrc=r=48000:cl=stereo'] : []), '-map','0:v:0','-map',hasAudio ? '0:a:0' : '1:a:0','-vf',`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25`, '-c:v','libx264','-threads','2','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-shortest',normalized], signal);
      }
      const list = path.join(temp, 'list.txt');
      await writeFile(list, files.map((_, i) => `file '${path.join(temp, `normalized-${i}.mp4`)}'`).join('\n'));
      await mkdir(outputDir, { recursive: true });
      const name = randomUUID() + '.mp4';
      await command(ffmpeg.path, ['-v','error','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',path.join(temp, 'final.mp4')], signal);
      signal.throwIfAborted();
      await copyFile(path.join(temp, 'final.mp4'), path.join(outputDir, name));
      res.json({ url: '/outputs/' + name });
    } catch (err) { if (!res.headersSent && !res.destroyed) res.status(502).json({ error: err.message }); }
    finally { active--; if (temp) await rm(temp, { recursive: true, force: true }); }
  });
}
