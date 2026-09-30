import { it, expect, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { createApp } from '../server/app.mjs';
import { KLEIN_MODEL, capabilitiesFor, kleinOptions, sourceDimensions } from '../shared/image-providers.mjs';
import { buildKleinForm, parseKleinMultipart, prepareKleinReference, decodeKleinImage } from '../server/cloudflare-klein.mjs';
import { generateImageBatch } from '../src/api/imageStudio';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ImageInput } from '../shared/image-contract.mjs';
const key='fixture-cloudflare-token',account='a'.repeat(32),nativeFetch=globalThis.fetch;
const original=await sharp({create:{width:1200,height:600,channels:3,background:'#123456'}}).jpeg().toBuffer();
const output=await sharp({create:{width:256,height:256,channels:3,background:'#ff3311'}}).png().toBuffer();
const input:ImageInput={model:KLEIN_MODEL.id,prompt:'Keep image 0 unchanged except the red hat.',mode:'edit',preset:'',shape:'custom',width:256,height:256,seed:42,guidance:3.5,references:[],style:'Cyberpunk',safe:true,consent:false,portraitStyle:'',purpose:'',background:''};
let servers:any[]=[],directories:string[]=[];
afterEach(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>{s.closeAllConnections();s.close(()=>r());})));await Promise.all(directories.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
async function studio(upstream:any) {
  vi.stubEnv('APP_PASSWORD','fixture-private');vi.stubEnv('CLOUDFLARE_ACCOUNT_ID',account);vi.stubEnv('CLOUDFLARE_API_TOKEN',key);
  vi.stubEnv('POLLINATIONS_API_KEY','');vi.stubEnv('PUBLIC_BASE_URL','');vi.stubEnv('RAILWAY_PUBLIC_DOMAIN','');
  const dir=await mkdtemp(path.join(tmpdir(),'klein-'));directories.push(dir);vi.stubEnv('MEDIA_DIR',dir);
  const server=createApp({upstream}).listen(0,'127.0.0.1');servers.push(server);await new Promise<void>(r=>server.once('listening',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const auth='Basic '+Buffer.from('kinesis:fixture-private').toString('base64');
  const r=await nativeFetch(origin+'/api/config',{headers:{Authorization:auth}});const cookie=r.headers.get('set-cookie')!.split(';')[0];
  vi.stubGlobal('fetch',(url:string,init:RequestInit={})=>nativeFetch(url.startsWith('/')?origin+url:url,{...init,headers:{...init.headers,...(url.startsWith('/')?{Cookie:cookie}:{})}}));
  return {origin,dir};
}
function form(n=0) {const f=new FormData();f.set('prompt',input.prompt);f.set('width','256');f.set('height','256');f.set('seed','42');f.set('guidance','3.5');for(let i=0;i<n;i++)f.set('input_image_'+i,new Blob([original],{type:'image/jpeg'}),`original-${i}.jpg`);return f;}
async function parse(f:FormData){const r=new Response(f);return parseKleinMultipart(Buffer.from(await r.arrayBuffer()),r.headers.get('content-type'));}
it('capability registry declares exactly the supported Klein controls',()=>{
  expect(KLEIN_MODEL.provider).toBe('cloudflare');expect(KLEIN_MODEL.model).toBe('@cf/black-forest-labs/flux-2-klein-4b');
  expect(capabilitiesFor(KLEIN_MODEL)).toMatchObject({textToImage:true,imageEditing:true,multiReference:true,maxReferences:4,seed:true,guidance:true,dimensions:true,steps:false,strength:false,negativePrompt:false,mask:false,promptTransforms:false});
});
it.each([0,1,4])('%i reference(s): actual client → production HTTP route → binary Cloudflare form → normalized history result',async n=>{
  let calls=0;
  const {origin}=await studio(async(url:string,init:any)=>{
    calls++;expect(url).toBe(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`);
    expect(init.headers).toEqual({Authorization:`Bearer ${key}`});expect(init.method).toBe('POST');expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('prompt')).toBe(input.prompt); // no hidden Cyberpunk suffix or edit rewrite
    expect(init.body.get('guidance')).toBe('3.5');expect(init.body.get('seed')).toBe('42');
    expect([...init.body.keys()].sort()).toEqual(['prompt','width','height','guidance','seed',...Array.from({length:n},(_,i)=>'input_image_'+i)].sort());
    for(let i=0;i<n;i++){
      const file=init.body.get('input_image_'+i);expect(file.type).toBe('image/png');
      const m=await sharp(Buffer.from(await file.arrayBuffer())).metadata();expect(m.width).toBe(511);expect(m.height).toBe(256);
    }
    return Response.json({success:true,result:{image:output.toString('base64')}});
  });
  const references=[];
  for(let i=0;i<n;i++){
    const saved=await(await fetch('/api/images/upload?private=true',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:original})).json();
    expect(saved.width).toBe(1200);references.push(saved.url);
  }
  const results:any[]=[];await generateImageBatch({...input,references},1,r=>results.push(r));expect(calls).toBe(1);
  const result=results[0];expect(result).toMatchObject({provider:'cloudflare',modelId:KLEIN_MODEL.id,mimeType:'image/png',seed:42,width:256,height:256});
  expect(Buffer.from(await(await fetch(result.url)).arrayBuffer())).toEqual(output);expect(result.references).toHaveLength(n);
  for(const url of result.references)expect(Buffer.from(await(await fetch(url)).arrayBuffer())).toEqual(original);
  expect(result.options.references).toEqual(result.references);expect((await nativeFetch(origin+result.url)).status).toBe(401);
});
it('reference resize preserves portrait/landscape ratios and never alters original buffers',async()=>{
  for(const [w,h] of [[1800,300],[300,1800],[512,512],[80,40]]){
    const bytes=await sharp({create:{width:w,height:h,channels:3,background:'red'}}).png().toBuffer();const snapshot=Buffer.from(bytes);
    const copy=await prepareKleinReference(bytes,'image/png'),meta=await sharp(copy).metadata();
    expect(meta.width).toBeLessThan(512);expect(meta.height).toBeLessThan(512);
    expect(Math.abs(meta.width!-meta.height!*w/h)).toBeLessThanOrEqual(w/h+1);expect(bytes).toEqual(snapshot);
    if(w<512&&h<512)expect([meta.width,meta.height]).toEqual([w,h]);
  }
});
it('reference numbers remain ordered and gaps/duplicates/fifth references are rejected',async()=>{
  const parsed=await parse(form(4));const built=buildKleinForm(parsed.options,parsed.references);
  expect([...built.keys()].filter(k=>k.startsWith('input_image'))).toEqual(['input_image_0','input_image_1','input_image_2','input_image_3']);
  const gap=form(2);gap.delete('input_image_0');await expect(parse(gap)).rejects.toThrow('contiguous');
  const fifth=form(5);await expect(parse(fifth)).rejects.toThrow('Unsupported');
  const dup=form();dup.append('prompt','twice');await expect(parse(dup)).rejects.toThrow('duplicate');
});
it.each(['steps','strength','negative_prompt','cfg','mask'])('rejects unsupported %s before any inference',async field=>{
  const f=form();f.append(field,'1');await expect(parse(f)).rejects.toThrow('Unsupported');
});
it.each([255,1921,300.5,NaN,Infinity])('rejects invalid dimension %s',width=>{expect(()=>kleinOptions({...input,width})).toThrow('256 to 1920');});
it('valid dimension edges and source-ratio defaults are normalized within supported limits',async()=>{
  expect(kleinOptions({...input,width:256,height:1920})).toMatchObject({width:256,height:1920});
  expect(sourceDimensions(1200,600)).toEqual([1024,512]);expect(sourceDimensions(100,100)).toEqual([1024,1024]);
  expect(()=>sourceDimensions(9000,100)).toThrow('Select an output preset');
  const f=form(1);f.delete('width');f.delete('height');expect((await parse(f)).options).toMatchObject({width:1024,height:512});
});
it('guidance supports finite floats; omitted guidance uses provider default',async()=>{
  expect(kleinOptions({...input,guidance:2.75}).guidance).toBe(2.75);
  expect(()=>kleinOptions({...input,guidance:NaN})).toThrow('finite');
  const f=form();f.delete('guidance');const p=await parse(f);expect(buildKleinForm(p.options,p.references).has('guidance')).toBe(false);
});
it('deterministic and random seed paths retain the chosen seed',async()=>{
  expect(kleinOptions(input,()=>99).seed).toBe(42);expect(kleinOptions({...input,seed:''},()=>123).seed).toBe(123);
  const f=form();f.delete('seed');const parsed=await parse(f);expect(parsed.options.seed).toBeGreaterThanOrEqual(0);expect(parsed.options.seed).toBeLessThanOrEqual(2147483647);
  for(const seed of [-1,2147483648,1.1])expect(()=>kleinOptions({...input,seed})).toThrow('Seed');
});
it('Base64 decoding preserves actual image format and rejects invalid payloads',async()=>{
  expect(decodeKleinImage({result:{image:output.toString('base64')}})).toEqual(output);
  expect(decodeKleinImage({result:{image:'data:image/jpeg;base64,'+original.toString('base64')}})).toEqual(original);
  for(const image of ['not!base64','',Buffer.from('not an image').toString('base64'),'data:image/jpeg;base64,'+output.toString('base64')])expect(()=>decodeKleinImage({result:{image}})).toThrow();
});
it.each([[401,10000,'authentication_failed'],[403,5018,'authentication_failed'],[429,3036,'quota_exhausted'],[403,5035,'quota_exhausted'],[429,3040,'rate_limited'],[400,5004,'invalid_model_input'],[503,0,'cloudflare_service_failure']])('upstream %i/%i has structured %s with no automatic retry/fallback',async(status,code,expected)=>{
  let calls=0;await studio(async()=>{calls++;return Response.json({success:false,errors:[{code,message:key}]},{status:Number(status),headers:{'Retry-After':'10'}});});
  const r=await fetch('/api/image-edit/cloudflare-klein',{method:'POST',body:form()});const text=await r.text();expect(JSON.parse(text).error.code).toBe(expected);expect(text).not.toContain(key);expect(calls).toBe(1);
});
it('missing configuration is distinct and Cloudflare catalogue survives Pollinations failure',async()=>{
  await studio(async()=>{throw new Error('Pollinations unavailable');});
  const catalogue=await(await fetch('/api/images/catalog')).json();expect(catalogue.providers.cloudflare).toBe(true);
  expect(catalogue.models.find((m:any)=>m.id===KLEIN_MODEL.id).available).toBe(true);expect(JSON.stringify(catalogue)).not.toContain(key);expect(JSON.stringify(catalogue)).not.toContain(account);
  vi.stubEnv('CLOUDFLARE_API_TOKEN','');const r=await fetch('/api/image-edit/cloudflare-klein',{method:'POST',body:form()});expect(r.status).toBe(503);expect((await r.json()).error.code).toBe('missing_configuration');
});
it('malformed multipart, invalid file MIME/data and oversize files cannot reach Cloudflare',async()=>{
  const upstream=vi.fn();await studio(upstream);
  for(const headers of [{'Content-Type':'application/json'},{'Content-Type':'multipart/form-data; boundary=bad'}]) {
    const r=await fetch('/api/image-edit/cloudflare-klein',{method:'POST',headers,body:'broken'});expect(r.status).toBe(400);expect((await r.json()).error.code).toBe('invalid_upload');
  }
  const f=form();f.append('input_image_0',new Blob(['<svg/>'],{type:'image/svg+xml'}),'a.svg');await expect(parse(f)).rejects.toThrow('MIME');
  await expect(prepareKleinReference(Buffer.alloc(24*1024*1024+1),'image/png')).rejects.toThrow('24 MiB');
  const noPrompt=form();noPrompt.delete('prompt');await expect(parse(noPrompt)).rejects.toThrow('Prompt');expect(upstream).not.toHaveBeenCalled();
});
it('reference numbering binds distinct image content, not just filenames',async()=>{
  const first=await sharp({create:{width:600,height:600,channels:3,background:'#ff0000'}}).png().toBuffer();
  const second=await sharp({create:{width:600,height:600,channels:3,background:'#0000ff'}}).png().toBuffer();
  const f=form();f.set('input_image_0',new Blob([first],{type:'image/png'}),'red.png');f.set('input_image_1',new Blob([second],{type:'image/png'}),'blue.png');
  const parsed=await parse(f),wire=buildKleinForm(parsed.options,parsed.references);
  const pixel=async(i:number)=>[...await sharp(Buffer.from(await (wire.get('input_image_'+i) as File).arrayBuffer())).resize(1,1).raw().toBuffer()];
  expect(await pixel(0)).toEqual([255,0,0]);expect(await pixel(1)).toEqual([0,0,255]);
});
it('client abort terminates the server Cloudflare request and never publishes a result',async()=>{
  let started:()=>void=()=>{};const ready=new Promise<void>(r=>{started=r;});let stopped=false;
  await studio(async(_url:string,init:any)=>{started();return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>{stopped=true;reject(init.signal.reason);},{once:true}));});
  const controller=new AbortController(),publish=vi.fn();
  const run=generateImageBatch(input,1,publish,controller.signal);const rejection=expect(run).rejects.toThrow();
  await ready;controller.abort();await rejection;await vi.waitFor(()=>expect(stopped).toBe(true));expect(publish).not.toHaveBeenCalled();
});
