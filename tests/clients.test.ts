import { it, expect, vi, afterEach } from 'vitest';
import { submitFalJob, pollFalJob } from '../src/api/fal';
import { ensureImageUrl } from '../src/api/imageUpload';
import { apiFetch } from '../src/api/helpers';
import { MODEL_REGISTRY } from '../src/constants';
import { pollReplicateJob } from '../src/api/replicate';
import { pollRunwayJob } from '../src/api/runway';
import { pollLumaJob } from '../src/api/luma';
const key = {fal:'test',replicate:'test',runway:'test',luma:'test',comfyui:''};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('actual Fal submit → poll → result client with mocked HTTP', async () => {
  vi.useFakeTimers();
  const requests: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    requests.push({url,init});
    if (init.method==='POST') return Response.json({request_id:'job',status_url:'https://queue.fal.run/lightricks/ltx-2.5/requests/job/status',response_url:'https://queue.fal.run/lightricks/ltx-2.5/requests/job'});
    if (decodeURIComponent(url).endsWith('/status')) return Response.json({status:'COMPLETED'});
    return Response.json({video:{url:'https://v3.fal.media/output.mp4'}});
  }));
  const model = MODEL_REGISTRY.find(m=>m.id==='fal-ltx-2.5-pro-i2v')!;
  const job = await submitFalJob({model,prompt:'Pan slowly',negativePrompt:'blur',durationSeconds:6,aspectRatio:'16:9',seed:null,cfgScale:.5,imageUrl:'https://v3.fal.media/input.png'},'test');
  const result = pollFalJob(job.statusUrl,job.responseUrl,'test');
  await vi.advanceTimersByTimeAsync(4000);
  expect(await result).toBe('https://v3.fal.media/output.mp4'); expect(requests).toHaveLength(3);
});
it('data-URL upload uses binary bytes and never fabricates a URL', async () => {
  const nativeFetch = fetch;
  vi.stubGlobal('fetch',vi.fn(async (url,init) => {
    if (url.startsWith('data:')) return nativeFetch(url,init);
    expect(url).toBe('/api/fal-file');expect(init.body.type).toBe('image/png');expect(await init.body.text()).toBe('hello');
    return Response.json({url:'https://v3.fal.media/upload.png'});
  }));
  expect(await ensureImageUrl('data:image/png;base64,aGVsbG8=','fal',key)).toBe('https://v3.fal.media/upload.png');
  expect(await ensureImageUrl('data:image/png;base64,aGVsbG8=','runway',key)).toContain('data:image/png');
});
it('cancellation stops polling and requests a remote queue cancellation', async () => {
  vi.useFakeTimers();const calls: string[]=[];
  vi.stubGlobal('fetch',vi.fn(async (url) => {calls.push(url);return Response.json({});}));
  const c = new AbortController();
  const job = pollFalJob('https://queue.fal.run/fal-ai/ltx-2.3/requests/job/status','https://queue.fal.run/fal-ai/ltx-2.3/requests/job','test',undefined,c.signal);
  const assertion = expect(job).rejects.toMatchObject({name:'AbortError'});c.abort();await assertion;
  expect(calls).toHaveLength(1);expect(decodeURIComponent(calls[0])).toContain('/cancel');
});
it('cancelled HTTP requests are not retried', async () => {
  const c = new AbortController();c.abort();const f = vi.fn();vi.stubGlobal('fetch',f);
  await expect(apiFetch('/api/fal',{method:'POST',signal:c.signal})).rejects.toMatchObject({name:'AbortError'});expect(f).not.toHaveBeenCalled();
});
it.each([
  ['replicate',pollReplicateJob,{status:'succeeded',output:'https://replicate.delivery/x.mp4'}],
  ['runway',pollRunwayJob,{status:'SUCCEEDED',output:['https://runwayml.com/x.mp4']}],
  ['luma',pollLumaJob,{state:'completed',assets:{video:'https://cdn-luma.com/x.mp4'}}],
] as const)('%s polling regression', async (_name,poll,result) => {
  vi.useFakeTimers();vi.stubGlobal('fetch',vi.fn(async()=>Response.json(result)));
  const promise = poll('job','test');await vi.advanceTimersByTimeAsync(4000);expect(await promise).toContain('https://');
});
