import { it, expect, afterEach } from 'vitest';
import { createApp, allowedMedia } from '../server/app.mjs';
const servers = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise(r => { s.closeAllConnections(); s.close(r); }))); });
export async function serve(options) {
  const server = createApp(options).listen(0, '127.0.0.1'); servers.push(server);
  await new Promise(r => server.once('listening', r));
  return `http://127.0.0.1:${server.address().port}`;
}
it('all API validation paths and SPA routing', async () => {
  const base = await serve({upstream:()=>{throw new Error('must not call upstream');}});
  expect((await fetch(base)).status).toBe(200);
  expect((await fetch(base+'/studio')).headers.get('content-type')).toContain('text/html');
  for (const name of ['fal','fal-file','replicate','runway','luma']) {
    expect((await fetch(base+'/api/'+name,{method:'POST'})).status).toBe(401);
    expect((await fetch(base+'/api/'+name,{method:'PATCH'})).status).toBe(405);
    expect((await fetch(base+'/api/'+name,{method:'OPTIONS'})).status).toBe(204);
    expect((await fetch(base+'/api/'+name,{method:'POST',headers:{Authorization: name.startsWith('fal') ? 'Key test' : 'Bearer test','Content-Type':'application/json'},body:'{'})).status).toBe(400);
  }
  for (const url of ['/api/media','/api/media?url=https://127.0.0.1/admin','/api/media?url=https://fal.media.evil.com/file','/api/process']) {
    expect((await fetch(base+url,{method:url.includes('process')?'POST':'GET'})).status).toBe(400);
  }
  expect((await fetch(base+'/api/config')).status).toBe(200);
  expect((await fetch(base+'/api/nope')).status).toBe(404);
});
it('binary range forwarding, CORS, upstream errors and no redirects', async () => {
  const base = await serve({upstream: async (url, init) => {
    if (url.endsWith('redirect')) return new Response(null,{status:302,headers:{location:'http://127.0.0.1'}});
    expect(init.headers.Range).toBe('bytes=0-3');
    return new Response(new Uint8Array([0,255,128,1]),{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 0-3/10','Accept-Ranges':'bytes','Content-Length':'4'}});
  }});
  const res = await fetch(base+'/api/media?url=https://v3.fal.media/video.mp4',{headers:{Range:'bytes=0-3'}});
  expect(res.status).toBe(206); expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0,255,128,1]);
  expect(res.headers.get('content-range')).toBe('bytes 0-3/10'); expect(res.headers.get('access-control-allow-origin')).toBe('*');
  expect((await fetch(base+'/api/media?url=https://v3.fal.media/redirect')).status).toBe(502);
  expect(allowedMedia('https://fal.media@127.0.0.1/x')).toBe(false);
});
it('JSON proxy bodies and upstream status are preserved for every provider', async () => {
  const paths = {fal:'/lightricks/ltx-2.5/image-to-video/pro',replicate:'/v1/models/minimax/video-01/predictions',runway:'/v1/image_to_video',luma:'/dream-machine/v1/generations'};
  const base = await serve({upstream: async (_url, init) => { expect(JSON.parse(init.body)).toEqual({input:{prompt:'test'}}); return Response.json({error:'mock upstream rejection'},{status:422}); }});
  for (const [provider,targetPath] of Object.entries(paths)) {
    const input = provider === 'fal' ? {input:{input:{prompt:'test'}}} : {input:{prompt:'test'}};
    const res = await fetch(base+'/api/'+provider,{method:'POST',headers:{'Content-Type':'application/json',Authorization:provider==='fal'?'Key test':'Bearer test'},body:JSON.stringify({targetPath,...input})});
    expect(res.status).toBe(422); expect((await res.json()).error).toBe('mock upstream rejection');
    expect((await fetch(base+'/api/'+provider+'?targetPath=https://127.0.0.1/',{headers:{Authorization:provider==='fal'?'Key test':'Bearer test'}})).status).toBe(400);
  }
});
it('Fal upload accepts raw bytes and returns only actual hosted URL', async () => {
  const base = await serve({upload: async (blob,key)=> {expect(key).toBe('test');expect(blob.type).toBe('image/png');expect(blob.size).toBe(4);return 'https://v3.fal.media/upload.png';}});
  const res = await fetch(base+'/api/fal-file',{method:'POST',headers:{'Content-Type':'image/png',Authorization:'Key test'},body:new Uint8Array([1,2,3,4])});
  expect(await res.json()).toEqual({url:'https://v3.fal.media/upload.png'});
});
it('new upload/process routes reject invalid requests and unknown API paths stay JSON', async () => {
  const base=await serve();
  expect((await fetch(base+'/healthz')).status).toBe(200);
  expect((await fetch(base+'/api/upload',{method:'POST',headers:{'Content-Type':'text/plain'},body:'bad'})).status).toBe(503);
  expect((await fetch(base+'/api/process',{method:'POST',headers:{'Content-Type':'application/json'},body:'null'})).status).toBe(400);
  expect((await fetch(base+'/api/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'stitch',urls:['file:///etc/passwd']})})).status).toBe(400);
  expect((await fetch(base+'/api/fal',{headers:{Origin:'https://untrusted.example'}})).status).toBe(403);
});
it('private server credentials are boolean-only in config and never required in the bundle', async () => {
  const oldPassword=process.env.APP_PASSWORD,oldKey=process.env.FAL_KEY;
  process.env.APP_PASSWORD='test-password-not-real';process.env.FAL_KEY='test-server-key';
  try {
    const base=await serve({upstream:async(_url,init)=>{expect(init.headers.Authorization).toBe('Key test-server-key');return Response.json({request_id:'job'});}});
    expect((await fetch(base+'/api/config')).status).toBe(401);
    const auth='Basic '+Buffer.from('kinesis:test-password-not-real').toString('base64');
    const response=await fetch(base+'/api/config',{headers:{Authorization:auth}});const text=await response.text();
    expect(text).not.toContain('test-server-key');expect(JSON.parse(text).fal).toBe(true);
    const cookie=response.headers.get('set-cookie').split(';')[0];
    const request=await fetch(base+'/api/fal',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({targetPath:'/lightricks/ltx-2.5/image-to-video/pro',prompt:'Pan'})});
    expect(request.status).toBe(200);
  } finally {
    if(oldPassword===undefined)delete process.env.APP_PASSWORD;else process.env.APP_PASSWORD=oldPassword;
    if(oldKey===undefined)delete process.env.FAL_KEY;else process.env.FAL_KEY=oldKey;
  }
});
it('Luma-compatible public image hosting returns real bytes without provider credentials', async () => {
  const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const path=await import('node:path');
  const dir=await mkdtemp(path.join(tmpdir(),'kinesis-upload-'));
  const oldBase=process.env.PUBLIC_BASE_URL, oldDir=process.env.MEDIA_DIR;
  process.env.PUBLIC_BASE_URL='https://studio.example';process.env.MEDIA_DIR=dir;
  try {
    const base=await serve();
    const response=await fetch(base+'/api/upload',{method:'POST',headers:{'Content-Type':'image/png'},body:new Uint8Array([137,80,78,71])});
    expect(response.status).toBe(200);const data=await response.json();expect(data.url).toMatch(/^https:\/\/studio.example\/shared\//);
    const download=await fetch(base+new URL(data.url).pathname);expect([...new Uint8Array(await download.arrayBuffer())]).toEqual([137,80,78,71]);
    expect((await fetch(base+'/api/upload',{method:'POST',headers:{'Content-Type':'text/html'},body:'bad'})).status).toBe(400);
  } finally {
    if(oldBase===undefined)delete process.env.PUBLIC_BASE_URL;else process.env.PUBLIC_BASE_URL=oldBase;
    if(oldDir===undefined)delete process.env.MEDIA_DIR;else process.env.MEDIA_DIR=oldDir;
    await rm(dir,{recursive:true,force:true});
  }
});
