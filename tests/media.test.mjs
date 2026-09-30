import { it, expect } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import ffprobe from '@ffprobe-installer/ffprobe';
import { command } from '../server/media.mjs';
import { createApp } from '../server/app.mjs';

it('real FFmpeg: actual final frame, two-segment stitch and retained audio', async () => {
  const dir = await mkdtemp(path.join(tmpdir(),'kinesis-test-'));
  const previous = process.env.MEDIA_DIR;process.env.MEDIA_DIR=dir;
  let server;
  try {
    const input = path.join(dir,'fixture.mp4');
    await command(ffmpeg.path,['-v','error','-f','lavfi','-i','color=c=red:s=64x64:d=0.5:r=25','-f','lavfi','-i','color=c=blue:s=64x64:d=0.5:r=25','-f','lavfi','-i','sine=frequency=440:duration=1.04','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-map','2:a','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',input]);
    const bytes=await readFile(input);
    server=createApp({upstream:async()=>new Response(bytes,{headers:{'Content-Type':'video/mp4'}})}).listen(0,'127.0.0.1');
    await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
    const processVideo=async operation=>{
      const response=await fetch(base+'/api/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation,urls:Array(operation==='frame'?1:2).fill('https://v3.fal.media/fixture.mp4')})});
      const data=await response.json();expect(data.error).toBeUndefined();expect(response.status).toBe(200);return data.url;
    };
    const frame=await processVideo('frame');expect(frame).toMatch(/^data:image\/png;base64,/);
    const frameFile=path.join(dir,'frame.png');const {writeFile}=await import('node:fs/promises');await writeFile(frameFile,Buffer.from(frame.split(',')[1],'base64'));
    const pixels=path.join(dir,'pixels.rgb');await command(ffmpeg.path,['-v','error','-i',frameFile,'-f','rawvideo','-pix_fmt','rgb24',pixels]);
    const pixel=await readFile(pixels);expect(pixel[2]).toBeGreaterThan(200);expect(pixel[0]).toBeLessThan(20); // actual final frame is blue, not original red
    const output=await processVideo('stitch');
    const result=JSON.parse(await command(ffprobe.path,['-v','quiet','-print_format','json','-show_streams','-show_format',path.join(dir,path.basename(output))]));
    expect(result.streams.map(s=>s.codec_type)).toContain('audio');expect(Number(result.format.duration)).toBeGreaterThan(2);
    const download=await fetch(base+output,{headers:{Range:'bytes=0-15'}});expect(download.status).toBe(206);expect(download.headers.get('content-type')).toContain('video/mp4');expect((await download.arrayBuffer()).byteLength).toBe(16);
  } finally {
    if (server) await new Promise(r=>{server.closeAllConnections();server.close(r);});
    if (previous===undefined) delete process.env.MEDIA_DIR;else process.env.MEDIA_DIR=previous;
    await rm(dir,{recursive:true,force:true});
  }
},30000);
it('media subprocess cancellation rejects with AbortError', async () => {
  const controller=new AbortController();
  const running=command(process.execPath,['-e','setInterval(()=>{},1000)'],controller.signal);
  const assertion=expect(running).rejects.toMatchObject({name:'AbortError'});
  controller.abort();await assertion;
});
