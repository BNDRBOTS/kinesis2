import { it, expect, vi, afterEach } from 'vitest';
import { buildComfyWorkflow, validateWorkflow, submitComfyUIJob, pollComfyUIJob } from '../src/api/comfyui';
import { MODEL_REGISTRY } from '../src/constants';
const template = {workflow:{'1':{class_type:'LoadImage',inputs:{image:''}},'2':{class_type:'TestVideoSampler',inputs:{text:'',negative:'',noise_seed:0,length:0,width:0,height:0,fps:0}}},bindings:{image:['1','image'],prompt:['2','text'],seed:['2','noise_seed'],frames:['2','length'],negativePrompt:['2','negative'],width:['2','width'],height:['2','height'],fps:['2','fps']} as Record<string,[string,string]>,fps:24,frameMultiple:8,frameOffset:1};
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it.each(MODEL_REGISTRY.filter(m=>m.provider==='comfyui'))('$id binds imported graph, does not guess checkpoints',model=>{
  const graph=buildComfyWorkflow(template,{model,prompt:'Pan',negativePrompt:'',durationSeconds:3,aspectRatio:'16:9',seed:42,cfgScale:.5,imageUrl:'input'},'uploaded.png');
  expect(graph['1'].inputs.image).toBe('uploaded.png');expect(graph['2'].inputs).toEqual({text:'Pan',negative:'',noise_seed:42,length:73,width:1280,height:720,fps:24});expect(template.workflow['2'].inputs.noise_seed).toBe(0);
});
it('rejects workflows without frame bindings',()=>{expect(()=>validateWorkflow({...template,bindings:{}})).toThrow('binding');});
it('Comfy upload → submit → poll only accepts video outputs',async()=>{
  vi.useFakeTimers();vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify(template)});
  vi.stubGlobal('fetch',vi.fn(async(url,init)=>{
    if(url.startsWith('data:')) return new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'image/png'}});
    if(url.endsWith('/upload/image')) {expect(init.body).toBeInstanceOf(FormData);return Response.json({name:'upload.png',subfolder:'',type:'input'});}
    if(url.endsWith('/prompt')) return Response.json({prompt_id:'job'});
    return Response.json({job:{status:{completed:true},outputs:{'9':{videos:[{filename:'output.mp4',type:'output'}]}}}});
  }));
  const model=MODEL_REGISTRY.find(m=>m.provider==='comfyui')!;
  const job=await submitComfyUIJob({model,prompt:'Pan',negativePrompt:'',durationSeconds:3,aspectRatio:'16:9',seed:42,cfgScale:.5,imageUrl:'data:image/png;base64,eA=='},'https://comfy.example');
  const output=pollComfyUIJob(job.promptId,'https://comfy.example');await vi.advanceTimersByTimeAsync(3000);expect(await output).toContain('/view?filename=output.mp4');
});
it('supports multiple seed/FPS targets and rejects unconfigured dimensions/frame limits',()=>{
  const model=MODEL_REGISTRY.find(m=>m.provider==='comfyCloud')!;
  const p={model,prompt:'Pan',negativePrompt:'',durationSeconds:3,aspectRatio:'1:1',seed:42,cfgScale:.5,imageUrl:'input'};
  const t={...template,workflow:{...template.workflow,'3':{class_type:'Sampler',inputs:{seed:0}}},bindings:{...template.bindings,seed:[['2','noise_seed'],['3','seed']] as Array<[string,string]>},dimensions:{'1:1':[640,640] as [number,number]},maxFrames:81};
  const graph=buildComfyWorkflow(t,p,'image.png');expect(graph['3'].inputs.seed).toBe(42);expect(graph['2'].inputs.width).toBe(640);
  expect(()=>buildComfyWorkflow(t,{...p,aspectRatio:'16:9'},'image.png')).toThrow('aspect ratio');
  expect(()=>buildComfyWorkflow(t,{...p,durationSeconds:10},'image.png')).toThrow('maxFrames');
});
