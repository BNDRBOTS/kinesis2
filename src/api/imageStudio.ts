import { generateCloudflareKlein, referenceBlob } from './cloudflareKlein';
import { KLEIN_MODEL, type ImageCapabilities } from '../../shared/image-providers.mjs';
import { apiFetch } from './helpers';
import type { ImageInput } from '../../shared/image-contract.mjs';
export interface ImageResult {id:string;url:string;prompt:string;model:string;seed:number|null;width:number;height:number;createdAt:number;provider?:string;modelId?:string;mimeType?:string;references?:string[];options?:ImageInput}
export interface ImageModel {id:string;label:string;model:string;seed:boolean;available:boolean;references:number;provider?:string;credentialLabel?:string;configured?:boolean;capabilities?:ImageCapabilities}
export async function uploadEditorReference(blob: Blob, signal?: AbortSignal, privateCopy=false): Promise<{url:string;width?:number;height?:number}> {
  if(!['image/jpeg','image/png','image/webp'].includes(blob.type) || blob.size>24*1024*1024)throw new Error('Use JPEG, PNG or WebP up to 24MB');
  const response=await apiFetch('/api/images/upload'+(privateCopy?'?private=true':''),{method:'POST',headers:{'Content-Type':blob.type},body:blob,signal});
  const data=await response.json();if(!data.url?.startsWith('https://') && !(privateCopy && /^\/image-outputs\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(data.url)))throw new Error('Reference upload returned no usable image URL');return data;
}
export async function uploadImageReference(blob:Blob,signal?:AbortSignal):Promise<string> {return (await uploadEditorReference(blob,signal)).url;}
const imageAdapters:Record<string,(input:ImageInput,signal?:AbortSignal)=>Promise<ImageResult>>={ [KLEIN_MODEL.id]:generateCloudflareKlein };
export async function generateImageBatch(input: ImageInput, count: number, onImage: (image:ImageResult)=>void, signal?:AbortSignal) {
  if(!Number.isInteger(count)||count<1||count>4)throw new Error('Image count must be 1–4');
  signal?.throwIfAborted();
  const adapter=imageAdapters[input.model];
  if(adapter) {
    if(count!==1)throw new Error('This model generates one image per request');
    const result=await adapter(input,signal);
    if(!/^\/image-outputs\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(result.url))throw new Error('Image generation returned no saved image');
    signal?.throwIfAborted();onImage(result);return;
  }
  const references=[];
  for(const ref of input.references) {
    if(/^\/image-outputs\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(ref)) references.push(await uploadImageReference(await(await apiFetch(ref,{method:'GET',signal})).blob(),signal));
    else references.push(ref);
  }
  for(let i=0;i<count;i++) {
    signal?.throwIfAborted();
    const response=await apiFetch('/api/images/generate',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,references,seed:(input.seed+i)%2147483648})},{timeoutMs:200000});
    const result=await response.json();
    if(!/^\/image-outputs\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(result.url))throw new Error('Image generation returned no saved image');
    signal?.throwIfAborted();onImage(result);
  }
}
export async function enhanceImagePrompt(prompt:string,signal?:AbortSignal):Promise<string> {
  const data=await(await apiFetch('/api/images/enhance',{method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})},{timeoutMs:200000})).json();
  if(typeof data.prompt!=='string')throw new Error('No enhanced prompt returned');return data.prompt;
}

export async function referenceDimensions(ref:string,signal?:AbortSignal):Promise<[number,number]> {
  const bitmap=await createImageBitmap(await referenceBlob(ref,signal));
  try {signal?.throwIfAborted();return [bitmap.width,bitmap.height];}finally {bitmap.close();}
}
