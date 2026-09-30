import { it, expect, afterEach, vi } from 'vitest';
import { createApp } from '../server/app.mjs';
import { imagePlan, composeImagePrompt, config, type ImageInput } from '../shared/image-contract.mjs';
import { generateImageBatch, uploadImageReference, enhanceImagePrompt } from '../src/api/imageStudio';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBZkAAAAASUVORK5CYII=','base64');
const input:ImageInput={prompt:'A lighthouse at sunrise',style:'No Style',mode:'generate',preset:'',model:'flux',shape:'3:4',safe:true,seed:42,references:[],consent:false,portraitStyle:'Professional Corporate',purpose:'LinkedIn Profile',background:'Studio Gray'};
const catalogue=config.models.map(m=>({name:m.model,input_modalities:['text',...(m.id==='flux'||m.id==='zimage'?[]:['image'])],output_modalities:['image'],max_reference_images:m.id==='grok'?1:10,supported_endpoints:['/image/{prompt}']}));
let servers:any[]=[],dirs:string[]=[];
const nativeFetch=globalThis.fetch;
afterEach(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();await Promise.all(servers.map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r());})));servers=[];await Promise.all(dirs.map(dir=>rm(dir,{recursive:true,force:true})));dirs=[];});
async function setup(upstream:any) {
  const dir=await mkdtemp(path.join(tmpdir(),'kinesis-image-'));dirs.push(dir);
  vi.stubEnv('APP_PASSWORD','fixture-password');vi.stubEnv('POLLINATIONS_API_KEY','fixture-polli-key');vi.stubEnv('MEDIA_DIR',dir);vi.stubEnv('PUBLIC_BASE_URL','https://studio.example');
  const server=createApp({upstream}).listen(0,'127.0.0.1');servers.push(server);await new Promise<void>(r=>server.once('listening',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const response=await nativeFetch(origin+'/api/config',{headers:{Authorization:'Basic '+Buffer.from('kinesis:fixture-password').toString('base64')}});
  const cookie=response.headers.get('set-cookie')!.split(';')[0];
  vi.stubGlobal('fetch',(url:string,init:RequestInit={})=>nativeFetch(url.startsWith('/')?origin+url:url,{...init,headers:{...init.headers,...(url.startsWith('/')?{Cookie:cookie}:{})}}));
  return {origin,dir};
}
it.each(config.models)('$label builds the documented canonical model request and only supported seeds',m=>{
  const plan=imagePlan({...input,model:m.id,prompt:'Tea / café? # sky & snow'});const url=new URL(plan.url);
  expect(decodeURIComponent(url.pathname.slice('/image/'.length))).toBe('Tea / café? # sky & snow');
  expect(url.origin).toBe('https://gen.pollinations.ai');expect(url.searchParams.get('model')).toBe(m.model);
  expect(url.searchParams.has('seed')).toBe(m.seed);expect(url.searchParams.get('width')).toBe('768');expect(url.searchParams.get('height')).toBe('1024');
  expect(url.searchParams.get('safe')).toBe('privacy,secrets,sexual,violence');expect(url.searchParams.has('enhance')).toBe(false);expect(url.searchParams.has('negative_prompt')).toBe(false);
});
it.each(['generate','reference','sketch','headshot','edit','blend'] as const)('full %s client → real HTTP backend → provider-contract fixture → saved image',async mode=>{
  let generations=0;
  const {origin}=await setup(async(url:string,init:any)=>{
    if(url.endsWith('/image/models'))return Response.json(catalogue);
    generations++;expect(init.headers.Authorization).toBe('Bearer fixture-polli-key');expect(init.redirect).toBe('error');
    const parsed=new URL(url);expect(parsed.pathname.startsWith('/image/')).toBe(true);expect(parsed.searchParams.get('seed')).toBe('42');
    if(mode!=='generate')expect(parsed.searchParams.get('image')).toContain('https://reference.example/first.png');
    if(mode==='headshot')expect(decodeURIComponent(parsed.pathname)).toContain('LinkedIn Profile');
    return new Response(PNG,{headers:{'Content-Type':'image/png'}});
  });
  const images:any[]=[];
  await generateImageBatch({...input,mode,model:'klein',consent:true,references:mode==='generate'?[]:['https://reference.example/first.png',...(mode==='blend'?['https://reference.example/second.png']:[])]},1,image=>images.push(image));
  expect(images).toHaveLength(1);expect(generations).toBe(1);expect(images[0].seed).toBe(42);
  const response=await fetch(images[0].url);expect(response.headers.get('content-type')).toContain('image/png');expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
  expect((await nativeFetch(origin+images[0].url)).status).toBe(401);
});
it.each(config.presets)('editing preset $id has an explicit visible prompt path',preset=>{
  const prompt=composeImagePrompt({...input,mode:'edit',preset:preset.id});expect(prompt).toContain(preset.prompt);expect(prompt).toContain(input.prompt);
});
it.each(Object.keys(config.styles))('style %s is appended once, with No Style unchanged',style=>{
  const prompt=composeImagePrompt({...input,style});expect(prompt).toBe([input.prompt,config.styles[style]].filter(Boolean).join('\n'));
});
it('uploads references, exposes only opaque public URLs, and enforces real image bytes',async()=>{
  const {origin}=await setup(()=>{throw new Error('not called');});
  const url=await uploadImageReference(new Blob([PNG],{type:'image/png'}));expect(url).toMatch(/^https:\/\/studio.example\/shared\/[a-f0-9-]+\.png$/);
  const response=await nativeFetch(origin+new URL(url).pathname);expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG);
  const bad=await fetch('/api/images/upload',{method:'POST',headers:{'Content-Type':'image/png'},body:'not an image'});expect(bad.status).toBe(400);
});
it('batches sequentially with distinct seeds and preserves partial output on failure',async()=>{
  const seeds:string[]=[];await setup(async(url:string)=>{
    if(url.endsWith('/image/models'))return Response.json(catalogue);
    seeds.push(new URL(url).searchParams.get('seed')!);
    return seeds.length===3?Response.json({error:'fixture failure'},{status:503}):new Response(PNG,{headers:{'Content-Type':'image/png'}});
  });
  const results:any[]=[];await expect(generateImageBatch(input,4,r=>results.push(r))).rejects.toThrow('503');
  expect(results).toHaveLength(2);expect(seeds).toEqual(['42','43','44']);
});
it('output can be reused as a reference without passing a private URL upstream',async()=>{
  const calls:URL[]=[];await setup(async(url:string)=>{
    if(url.endsWith('/image/models'))return Response.json(catalogue);
    calls.push(new URL(url));return new Response(PNG,{headers:{'Content-Type':'image/png'}});
  });
  let output='';await generateImageBatch(input,1,r=>{output=r.url;});
  await generateImageBatch({...input,model:'klein',mode:'edit',references:[output]},1,()=>{});
  expect(calls[1].searchParams.get('image')).toMatch(/^https:\/\/studio.example\/shared\//);
});
it('capability validation rejects text-only references and unavailable models before generation',async()=>{
  const calls:string[]=[];await setup(async(url:string)=>{calls.push(url);return Response.json(catalogue.filter(m=>m.name!=='qwen/qwen-image'));});
  await expect(generateImageBatch({...input,references:['https://reference.example/image.png']},1,()=>{})).rejects.toThrow('supports 0 reference');
  await expect(generateImageBatch({...input,model:'qwen'},1,()=>{})).rejects.toThrow('not currently available');
  expect(calls).toEqual(['https://gen.pollinations.ai/image/models']);
});
it('enhancement calls chat completions and returns reviewable text, not a hidden image parameter',async()=>{
  await setup(async(url:string,init:any)=>{expect(url).toBe('https://gen.pollinations.ai/v1/chat/completions');const body=JSON.parse(init.body);expect(body.messages[1].content).toBe('Lighthouse');expect(body.stream).toBe(false);return Response.json({choices:[{message:{content:'A lighthouse above calm water at dawn.'}}]});});
  expect(await enhanceImagePrompt('Lighthouse')).toContain('dawn');
});
it('aborting stops upstream work and prevents publishing an output',async()=>{
  let started:()=>void=()=>{};const start=new Promise<void>(r=>{started=r;});let stopped=false;
  const {dir}=await setup(async(url:string,init:any)=>{
    if(url.endsWith('/image/models'))return Response.json(catalogue);
    started();return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>{stopped=true;reject(init.signal.reason);},{once:true}));
  });
  const c=new AbortController(),callback=vi.fn();const promise=generateImageBatch(input,1,callback,c.signal);const rejected=expect(promise).rejects.toThrow();await start;c.abort();await rejected;
  await vi.waitFor(()=>expect(stopped).toBe(true));expect(callback).not.toHaveBeenCalled();expect(await readdir(dir)).toEqual([]);
});
it.each([{seed:-2},{shape:'bogus'},{model:'sdxl'},{mode:'headshot',consent:false},{mode:'blend',references:['https://example.com/a.png']},{references:['file:///etc/passwd']},{references:['https://127.0.0.1/a.png']},{style:'bogus'}])('invalid settings %j are rejected before inference',overrides=>{expect(()=>imagePlan({...input,...overrides} as ImageInput)).toThrow();});
it('rejects misleading JSON or SVG image responses, and redacts upstream key errors',async()=>{
  let step=0;await setup(async(url:string)=>{
    if(url.endsWith('/image/models'))return Response.json(catalogue);
    if(step++===0)return Response.json({url:'fake'});
    return Response.json({error:'fixture-polli-key rejected'},{status:401});
  });
  await expect(generateImageBatch(input,1,()=>{})).rejects.toThrow('supported image');
  try {await generateImageBatch(input,1,()=>{});throw new Error('expected failure');}catch(e){expect(String(e)).toContain('[redacted]');expect(String(e)).not.toContain('fixture-polli-key');}
});
