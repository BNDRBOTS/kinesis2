import sharp from 'sharp';
import { randomInt, randomUUID } from 'node:crypto';
import { KLEIN_MODEL, kleinOptions, sourceDimensions } from '../shared/image-providers.mjs';
import { imageType } from './image-storage.mjs';

const MAX_FILE=24*1024*1024, MAX_BODY=4*MAX_FILE+65536;
const MIME={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
const failure=(code,message,status=400)=>Object.assign(new Error(message),{code,status});
export async function prepareKleinReference(bytes, mime) {
  if(!bytes.length || bytes.length>MAX_FILE)throw failure('invalid_upload','Each reference must be 1 byte–24 MiB',413);
  if(!Object.values(MIME).includes(mime) || MIME[imageType(bytes)]!==mime)throw failure('invalid_upload','Reference MIME must match PNG, JPEG or WebP bytes');
  const image=sharp(bytes,{limitInputPixels:40000000,failOn:'error'});
  const metadata=await image.metadata();
  if((metadata.pages || 1)>1)throw failure('invalid_upload','Animated reference images are not supported');
  // EXIF orientation is applied to the provider copy, never to the stored original.
  const copy=await image.rotate().resize({width:511,height:511,fit:'inside',withoutEnlargement:true}).png().toBuffer();
  return copy;
}
export async function parseKleinMultipart(body, contentType) {
  if(!Buffer.isBuffer(body)||body.length>MAX_BODY)throw failure('invalid_upload','Multipart body exceeds the 96 MiB image limit',413);
  if(!/^multipart\/form-data;\s*boundary=/i.test(contentType || ''))throw failure('invalid_upload','Expected multipart/form-data with a boundary');
  let form;
  try { form=await new Response(body,{headers:{'Content-Type':contentType}}).formData(); }
  catch { throw failure('invalid_upload','Malformed multipart request'); }
  const fields=new Set(['prompt','width','height','guidance','seed','input_image_0','input_image_1','input_image_2','input_image_3']);
  for(const key of form.keys()) if(!fields.has(key)||form.getAll(key).length!==1)throw failure('invalid_model_input',`Unsupported or duplicate field: ${key}`);
  const input={};
  for(const key of ['prompt','width','height','seed','guidance']) {
    const value=form.get(key);
    if(value===null)continue;
    if(typeof value!=='string'||(key!=='prompt'&&!value.trim()))throw failure('invalid_model_input',`Invalid ${key}`);
    input[key]=key==='prompt'?value:Number(value);
  }
  let options;
  try {options=kleinOptions(input,()=>randomInt(2147483648));}
  catch(err){throw failure('invalid_model_input',err.message);}
  const references=[];
  for(let i=0;i<4;i++) {
    const file=form.get(`input_image_${i}`);
    if(file===null)continue;
    if(i!==references.length)throw failure('invalid_upload','Reference numbering must be contiguous from image 0; no images may be skipped');
    if(typeof file==='string')throw failure('invalid_upload',`Image ${i} must be a binary file part`);
    const bytes=Buffer.from(await file.arrayBuffer());
    try {const copy=await prepareKleinReference(bytes,file.type);references.push({bytes,mime:file.type,copy});}
    catch(err){throw failure('invalid_upload',`Image ${i}: ${err.message}`,err.status || 400);}
  }
  if(references.length && !form.has('width') && !form.has('height')) {
    const meta=await sharp(references[0].bytes,{limitInputPixels:40000000}).metadata();
    const dimensions=meta.autoOrient || meta;
    try {[options.width,options.height]=sourceDimensions(dimensions.width,dimensions.height);}
    catch(err){throw failure('invalid_model_input',err.message);}
  }
  return {options,references};
}
export function buildKleinForm(options,references) {
  const form=new FormData();
  for(const key of ['prompt','width','height','guidance','seed'])if(options[key]!==undefined)form.append(key,String(options[key]));
  references.forEach((ref,i)=>form.append(`input_image_${i}`,new Blob([ref.copy],{type:'image/png'}),`image-${i}.png`));
  return form;
}
export function decodeKleinImage(data) {
  let encoded=data?.result?.image;
  if(typeof encoded!=='string')throw failure('cloudflare_service_failure','Cloudflare returned no Base64 image',502);
  const match=encoded.match(/^data:(image\/(?:png|jpeg|webp));base64,(.*)$/s);
  if(match)encoded=match[2];
  if(encoded.length>40*1024*1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded) || !encoded.length)throw failure('cloudflare_service_failure','Cloudflare returned invalid or oversized Base64',502);
  const bytes=Buffer.from(encoded,'base64');
  try {const mime=MIME[imageType(bytes)];if(match&&match[1]!==mime)throw new Error('MIME mismatch');}
  catch {throw failure('cloudflare_service_failure','Cloudflare returned unsupported image bytes',502);}
  return bytes;
}
export function cloudflareError(status, data) {
  const codes=(data?.errors || []).map(e=>Number(e.code));
  if(codes.includes(3036)||status===402)return failure('quota_exhausted','Cloudflare allocation/quota exhausted. No upgrade or provider fallback was attempted.',429);
  if(codes.includes(5035))return failure('quota_exhausted','Cloudflare requires a different account entitlement. KINESIS will not upgrade or fall back.',403);
  if(status===401||status===403)return failure('authentication_failed','Cloudflare rejected the token, account access, or model permission.',status);
  if(status===429)return failure('rate_limited','Cloudflare rate limit or temporary capacity limit reached. Retry manually later.',429);
  if([5007,5004,3003,3006,3042].some(code=>codes.includes(code)) || [400,404,413,422].includes(status))return failure('invalid_model_input','Cloudflare rejected the model input.',422);
  return failure('cloudflare_service_failure','Cloudflare could not complete this image request.',502);
}
export function installCloudflareKlein(app,{upstream,saveImage}) {
  let active=0;
  app.post('/api/image-edit/cloudflare-klein',async(req,res)=>{
    const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
    const send=err=>{if(!res.headersSent&&!res.destroyed)res.status(err.status || 502).json({error:{code:err.code || 'cloudflare_service_failure',message:err.message},provider:'cloudflare'});};
    if(!process.env.APP_PASSWORD||!token||!/^[a-f0-9]{32}$/i.test(account || ''))return send(failure('missing_configuration','Configure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN on the password-protected server.',503));
    if(active>=2)return send(failure('rate_limited','KINESIS image workers are busy.',429));
    active++;
    const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(180000)]);
    try {
      const {options,references}=await parseKleinMultipart(req.body,req.headers['content-type']);
      signal.throwIfAborted();
      const response=await upstream(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${KLEIN_MODEL.model}`,{
        method:'POST',headers:{Authorization:`Bearer ${token}`},body:buildKleinForm(options,references),signal,redirect:'error',
      }); // Native FormData generates its boundary. Never set Content-Type here.
      let data;
      // Bound the Base64/JSON body before parsing rather than buffering arbitrary responses.
      let size=0;const chunks=[];
      for await(const chunk of response.body){size+=chunk.length;if(size>40*1024*1024)throw failure('cloudflare_service_failure','Cloudflare response exceeds 40 MiB',502);chunks.push(chunk);}
      try {data=JSON.parse(Buffer.concat(chunks).toString());}catch{throw cloudflareError(response.status,null);}
      if(!response.ok || data.success===false) {
        if(response.headers.get('retry-after'))res.setHeader('Retry-After',response.headers.get('retry-after'));
        throw cloudflareError(response.status,data);
      }
      const bytes=decodeKleinImage(data);
      const image=sharp(bytes,{limitInputPixels:40000000,failOn:'error'});
      const meta=await image.metadata();
      await image.stats(); // Decode pixels before publishing; a valid header alone is not a valid result.
      const originals=[];
      for(const ref of references)originals.push((await saveImage(ref.bytes,signal)).url);
      const stored=await saveImage(bytes,signal);
      signal.throwIfAborted();
      res.json({id:randomUUID(),...stored,provider:'cloudflare',modelId:KLEIN_MODEL.id,model:KLEIN_MODEL.model,
        prompt:options.prompt,seed:options.seed,width:meta.width,height:meta.height,createdAt:Date.now(),references:originals,
        options:{...options,model:KLEIN_MODEL.id,references:originals,mode:originals.length?'edit':'generate',style:'No Style',preset:'',shape:'custom',safe:true,consent:false,portraitStyle:'',purpose:'',background:''}});
    }catch(err){send(err.code&&err.status?err:failure('cloudflare_service_failure',signal.aborted?'Cloudflare request canceled or timed out.':'Cloudflare request failed.',502));}
    finally{active--;}
  });
}
