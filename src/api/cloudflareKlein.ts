import { kleinOptions, KLEIN_MODEL } from '../../shared/image-providers.mjs';
import type { ImageInput } from '../../shared/image-contract.mjs';
import { apiFetch, getProxiedMediaUrl } from './helpers';
import type { ImageResult } from './imageStudio';

export async function referenceBlob(ref:string,signal?:AbortSignal):Promise<Blob> {
  let url=ref;
  if(/^https:\/\//.test(ref) && typeof window!=='undefined' && new URL(ref).origin===window.location.origin)url=new URL(ref).pathname;
  if(!/^\/(?:image-outputs|shared)\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(url))url=getProxiedMediaUrl(url);
  const blob=await(await apiFetch(url,{method:'GET',signal})).blob();
  if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||!blob.size||blob.size>24*1024*1024)throw new Error('References must be PNG, JPEG or WebP up to 24 MiB');
  return blob;
}
export async function generateCloudflareKlein(input:ImageInput,signal?:AbortSignal):Promise<ImageResult> {
  if(input.references.length>4)throw new Error('Klein supports at most 4 reference images. Remove extras explicitly.');
  const options=kleinOptions(input);
  const form=new FormData();
  for(const [key,value] of Object.entries(options)) {
    if(input.shape==='source' && input.references.length && (key==='width'||key==='height'))continue;
    form.append(key,String(value));
  }
  for(let i=0;i<input.references.length;i++) {
    const blob=await referenceBlob(input.references[i],signal);
    form.append(`input_image_${i}`,blob,`image-${i}.${blob.type==='image/jpeg'?'jpg':blob.type.split('/')[1]}`);
  }
  const response=await apiFetch('/api/image-edit/cloudflare-klein',{method:'POST',body:form,signal},{timeoutMs:200000});
  const result=await response.json();
  if(result.model!==KLEIN_MODEL.model)throw new Error('Unexpected image model response');
  return result;
}
