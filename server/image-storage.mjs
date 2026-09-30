import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
export function imageType(bytes) {
  if (bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (bytes.length >= 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'webp';
  throw new Error('Expected real PNG, JPEG or WebP image bytes');
}

export function imageStore(dir) {
  return async (bytes, signal) => {
    const ext=imageType(bytes), name=randomUUID()+'.'+ext;
    const temporary=path.join(dir,name+'.part');
    try {
      signal?.throwIfAborted();await mkdir(dir,{recursive:true});await writeFile(temporary,bytes);
      signal?.throwIfAborted();await rename(temporary,path.join(dir,name));
      return {url:'/image-outputs/'+name,mimeType:({'png':'image/png','jpg':'image/jpeg','webp':'image/webp'})[ext]};
    } finally {await rm(temporary,{force:true});}
  };
}
