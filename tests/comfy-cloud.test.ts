import { it, expect, vi, afterEach } from 'vitest';
import { createApp } from '../server/app.mjs';
import { runComfyCloud } from '../src/api/comfyCloud';
import { MODEL_REGISTRY } from '../src/constants';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { command } from '../server/media.mjs';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

const JOB = '11111111-1111-4111-8111-111111111111';
const ASSET = '22222222-2222-4222-8222-222222222222';
const base = 'https://cloud.comfy.org';
const template = {
  workflow: { '1': { class_type: 'LoadImage', inputs: { image: '' } }, '2': { class_type: 'FixtureVideo', inputs: { prompt:'', negative:'', seed:0, frames:0, width:0, height:0, fps:0 } } },
  bindings: { image:['1','image'], prompt:['2','prompt'], negativePrompt:['2','negative'], seed:['2','seed'], frames:['2','frames'], width:['2','width'], height:['2','height'], fps:['2','fps'] },
  fps:18, frameMultiple:4, frameOffset:1, dimensions:{'1:1':[640,640]},
};
const params = { model: MODEL_REGISTRY.find(m=>m.provider==='comfyCloud')!, prompt:'pan', negativePrompt:'blur', seed:42, durationSeconds:4.5, aspectRatio:'1:1', cfgScale:1, imageUrl:'data:image/png;base64,iVBORw0KGgo=' };
function job(status='queued', extra={}) {
  return { id:JOB, status, created_at:'2026-09-29T00:00:00Z', started_at:null, completed_at:null, expires_at:'2026-10-29T00:00:00Z', queue_position:0, progress:null, outputs:[], error:null,
    urls:{self:`${base}/api/v2/jobs/${JOB}`,cancel:`/api/v2/jobs/${JOB}/cancel`,events:`/api/v2/jobs/${JOB}/events`}, ...extra };
}
const servers: any[] = [];
const originalFetch = globalThis.fetch;
afterEach(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r());})));});
async function studio(upstream: any) {
  vi.stubEnv('APP_PASSWORD','fixture-password'); vi.stubEnv('COMFY_CLOUD_API_KEY','fixture-cloud-key');
  const server=createApp({upstream}).listen(0,'127.0.0.1'); servers.push(server); await new Promise<void>(r=>server.once('listening',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const auth='Basic '+Buffer.from('kinesis:fixture-password').toString('base64');
  const authResponse=await originalFetch(origin+'/api/config',{headers:{Authorization:auth}});
  expect(await authResponse.json()).toMatchObject({comfyCloud:true});
  const cookie=authResponse.headers.get('set-cookie')!.split(';')[0];
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify(template)});
  vi.stubGlobal('fetch',(url:string,init:RequestInit={})=>originalFetch(url.startsWith('/')?origin+url:url,{...init,headers:{...init.headers,...(url.startsWith('/')?{Cookie:cookie}:{})}}));
  return origin;
}
it('API-level lifecycle: UI client → real authenticated KINESIS HTTP server → v2 wire fixture → binary download/playback',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'comfy-cloud-test-')); vi.stubEnv('MEDIA_DIR',dir);
  try {
    const fixture=path.join(dir,'fixture.mp4');
    await command(ffmpeg.path,['-v','error','-f','lavfi','-i','color=c=blue:s=64x64:d=0.2','-c:v','libx264','-threads','1','-pix_fmt','yuv420p',fixture],new AbortController().signal);
    const bytes=await readFile(fixture); const calls:string[]=[];
    const origin=await studio(async(url:string,init:any)=>{
      calls.push(url);
      if(url.startsWith('https://storage.googleapis.com/')) {expect(init.headers).toBeUndefined();return new Response(bytes,{headers:{'Content-Type':'video/mp4'}});}
      expect(init.headers.Authorization).toBe('Bearer fixture-cloud-key'); expect(init.redirect).toBe('manual');
      if(url.endsWith('/assets')) {
        expect(init.headers['Content-Type']).toContain('multipart/form-data; boundary=');
        const form=await new Response(init.body,{headers:{'Content-Type':init.headers['Content-Type']}}).formData();
        expect(form.get('file')).toBeInstanceOf(File);expect(form.get('content_type')).toBe('image/png');expect(form.get('file_path')).toMatch(/\.png$/);
        return Response.json({id:ASSET,hash:null,size_bytes:8,content_type:'image/png',created_at:'2026-09-29',url:'https://storage.googleapis.com/input',url_expires_at:'2026-09-30'},{status:201});
      }
      if(url.endsWith('/jobs')) {
        const payload=JSON.parse(init.body);expect(payload.extra_data).toEqual({api_key_comfy_org:'fixture-cloud-key'});
        expect(payload.workflow['1'].inputs.image).toEqual({__type:'core/ASSET',info:{id:ASSET}});
        expect(payload.workflow['2'].inputs).toEqual({prompt:'pan',negative:'blur',seed:42,frames:81,width:640,height:640,fps:18});
        expect(init.headers['Idempotency-Key']).toBeTruthy();return Response.json(job(),{status:201});
      }
      if(url.endsWith('/content')) return new Response(null,{status:302,headers:{Location:'https://storage.googleapis.com/bucket/video?signature=fixture'}});
      return Response.json(job('succeeded',{outputs:[{id:ASSET,node_id:'2',name:'out.mp4',type:'video',content_type:'video/mp4',size_bytes:bytes.length,hash:null,url:`${base}/api/v2/assets/${ASSET}/content`,url_expires_at:'2026-10-29'}]}));
    });
    const output=await runComfyCloud(params,'server-managed');expect(output).toMatch(/^\/outputs\/.+\.mp4$/);
    const response=await fetch(output,{headers:{Range:'bytes=0-15'}});expect(response.status).toBe(206);expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes.subarray(0,16));
    expect(calls).toHaveLength(5);
    expect((await originalFetch(origin+'/api/comfy-cloud?targetPath=/api/v2/jobs/'+JOB)).status).toBe(401);
  } finally { await rm(dir,{recursive:true,force:true}); }
},15000);

it.each(['failed','expired','canceled'])('terminal %s is an error, never a video success',async(status)=>{
  await studio(async(url:string)=>url.endsWith('/assets')?Response.json({id:ASSET}):Response.json(job(status,{error:{code:'fixture_error',message:'failure'}})));
  await expect(runComfyCloud(params,'server-managed')).rejects.toThrow(status);
});
it.each([401,402,403,422,500])('preserves upstream HTTP %s and never duplicates a rejected submission',async(status)=>{
  let submissions=0;
  await studio(async(url:string)=>{if(url.endsWith('/assets'))return Response.json({id:ASSET});submissions++;return Response.json({error:{code:'fixture_error',message:'fixture-cloud-key'}},{status});});
  await expect(runComfyCloud(params,'server-managed')).rejects.toThrow(`HTTP ${status}`);expect(submissions).toBe(1);
});
it('abort requests the specific job cancellation, without aborting cancellation itself',async()=>{
  let canceled=false;const abort=new AbortController();
  await studio(async(url:string)=>{
    if(url.endsWith('/assets'))return Response.json({id:ASSET});
    if(url.endsWith('/cancel')){canceled=true;return Response.json(job('canceling'));}
    return Response.json(job());
  });
  await expect(runComfyCloud(params,'server-managed',()=>abort.abort(),abort.signal)).rejects.toThrow();
  // Cancel is detached from the already-aborted user request.
  await vi.waitFor(()=>expect(canceled).toBe(true));
});
it('rejects foreign response links and Cloud storage redirects to private origins',async()=>{
  await studio(async(url:string)=>{
    if(url.endsWith('/assets'))return Response.json({id:ASSET});
    if(url.endsWith('/content'))return new Response(null,{status:302,headers:{Location:'http://127.0.0.1/private'}});
    return Response.json(job('succeeded',{outputs:[{content_type:'video/mp4',url:`/api/v2/assets/${ASSET}/content`}]}));
  });
  await expect(runComfyCloud(params,'server-managed')).rejects.toThrow('unsupported storage host');
  const denied=await fetch('/api/comfy-cloud?targetPath='+encodeURIComponent('https://evil.example/api/v2/jobs/'+JOB));expect(denied.status).toBe(400);
});
it('reports missing video and blocks generation when already aborted',async()=>{
  const upstream=vi.fn(async(url:string)=>url.endsWith('/assets')?Response.json({id:ASSET}):Response.json(job('succeeded')));await studio(upstream);
  await expect(runComfyCloud(params,'server-managed')).rejects.toThrow('without the selected');
  upstream.mockClear();await expect(runComfyCloud(params,'server-managed',undefined,AbortSignal.abort())).rejects.toThrow();expect(upstream).not.toHaveBeenCalled();
});
it('429 uses bounded backoff and reuses the submission key',async()=>{
  const keys:string[]=[];
  await studio(async(url:string,init:any)=>{
    if(url.endsWith('/assets'))return Response.json({id:ASSET});
    keys.push(init.headers['Idempotency-Key']);
    if(keys.length===1)return Response.json({error:{code:'queue_full',message:'Queue full'}},{status:429,headers:{'Retry-After':'1'}});
    return Response.json(job('failed',{error:{code:'fixture',message:'stop'}}));
  });
  await expect(runComfyCloud(params,'server-managed')).rejects.toThrow('failed');expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);
});
it('Cloud multi-segment pipeline uploads the decoded final frame and preserves the locked seed',async()=>{
  const {runPipeline}=await import('../src/api/orchestrator');
  const dir=await mkdtemp(path.join(tmpdir(),'comfy-cloud-chain-'));vi.stubEnv('MEDIA_DIR',dir);
  try {
    const fixture=path.join(dir,'fixture.mp4');
    await command(ffmpeg.path,['-v','error','-f','lavfi','-i','color=c=blue:s=64x64:d=0.2','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-c:a','aac','-shortest',fixture],new AbortController().signal);
    const bytes=await readFile(fixture);const uploads:number[]=[];const seeds:number[]=[];
    await studio(async(url:string,init:any)=>{
      if(url.endsWith('/assets')) {
        const form=await new Response(init.body,{headers:{'Content-Type':init.headers['Content-Type']}}).formData();uploads.push((form.get('file') as File).size);return Response.json({id:ASSET});
      }
      if(url.endsWith('/content'))return new Response(bytes,{headers:{'Content-Type':'video/mp4'}});
      seeds.push(JSON.parse(init.body).workflow['2'].inputs.seed);
      return Response.json(job('succeeded',{outputs:[{content_type:'video/mp4',url:`/api/v2/assets/${ASSET}/content`}]}));
    });
    let output='';const segments:any[]=[];
    await runPipeline(params,9,{comfyui:'',comfyCloud:'server-managed',fal:'',replicate:'',runway:'',luma:''},
      {autoStitch:true,keepIntermediateSlices:false,generateFoleyAudio:false,aiUpscaleFinal:false,foleyPrompt:'',autoEnhancePrompt:false,enableGumroadGate:false,gumroadProductId:''},
      {onSegmentCreated:s=>segments.push(s),onSegmentUpdated:()=>{},onStitchStart:()=>{},onStitchComplete:url=>{output=url;},onAudioStart:()=>{},onAudioComplete:()=>{},onUpscaleStart:()=>{},onUpscaleComplete:()=>{},onError:m=>{throw new Error(m);},onProgress:()=>{}});
    expect(uploads).toHaveLength(2);expect(uploads[1]).toBeGreaterThan(uploads[0]);expect(seeds).toEqual([42,42]);
    expect(segments[0].lastFrameUrl).toMatch(/^data:image\/png;base64,/);expect(output).toMatch(/^\/outputs\/.+\.mp4$/);
    const ffprobe=(await import('@ffprobe-installer/ffprobe')).default;
    const metadata=JSON.parse(await command(ffprobe.path,['-v','quiet','-show_streams','-of','json',path.join(dir,path.basename(output))],new AbortController().signal));
    expect(metadata.streams.some((s:any)=>s.codec_type==='audio')).toBe(true);
  } finally {await rm(dir,{recursive:true,force:true});}
},15000);
it('explicit browser key stays in headers, overrides server key, and is redacted from errors',async()=>{
  await studio(async(_url:string,init:any)=>{
    expect(init.headers.Authorization).toBe('Bearer browser-fixture-key');
    return Response.json({error:{code:'unauthorized',message:'browser-fixture-key rejected'}},{status:401});
  });
  const response=await fetch('/api/comfy-cloud?targetPath=/api/v2/jobs/'+JOB,{headers:{'X-Comfy-Key':'browser-fixture-key'}});
  expect(response.status).toBe(401);const text=await response.text();expect(text).toContain('[redacted]');expect(text).not.toContain('browser-fixture-key');
});
it('Cloud proxy rejects unsupported methods, cross-origin requests, malformed JSON and non-API graphs',async()=>{
  const upstream=vi.fn();await studio(upstream);
  expect((await fetch('/api/comfy-cloud',{method:'DELETE'})).status).toBe(405);
  expect((await fetch('/api/comfy-cloud',{headers:{Origin:'https://evil.example'}})).status).toBe(403);
  for(const body of ['{','null',JSON.stringify({workflow:{nodes:[],links:[]}})]) {
    expect((await fetch('/api/comfy-cloud?targetPath=/api/v2/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body})).status).toBe(400);
  }
  expect(upstream).not.toHaveBeenCalled();
});
