import type { GenerationParams } from '../types';
import { apiFetch, sleep, getProxiedMediaUrl } from './helpers';

export type WorkflowBinding = [string, string] | Array<[string, string]>;
function targets(binding: WorkflowBinding): Array<[string, string]> {
  return typeof binding?.[0] === 'string' ? [binding as [string, string]] : binding as Array<[string, string]>;
}
export interface WorkflowTemplate {
  workflow: Record<string, { class_type: string; inputs: Record<string, unknown> }>;
  bindings: Record<string, WorkflowBinding>;
  maxFrames?: number;
  fps: number;
  outputNode?: string;
  dimensions?: Record<string, [number, number]>;
  frameMultiple: number;
  frameOffset: number;
}
export function validateWorkflow(template: WorkflowTemplate) {
  if (!template?.workflow || !template.bindings || !Number.isFinite(template.fps) || template.fps <= 0 || !Number.isInteger(template.frameMultiple) || template.frameMultiple < 1 || !Number.isInteger(template.frameOffset) || template.frameOffset < 0) throw new Error('Invalid ComfyUI workflow configuration');
  if (template.maxFrames !== undefined && (!Number.isInteger(template.maxFrames) || template.maxFrames < 1)) throw new Error('Invalid workflow maxFrames');
  if (template.dimensions && Object.values(template.dimensions).some(d => !Array.isArray(d) || d.length !== 2 || d.some(n => !Number.isInteger(n) || n < 64 || n > 4096))) throw new Error('Invalid workflow dimensions');
  if (template.outputNode && !template.workflow[template.outputNode]) throw new Error('Invalid workflow output node');
  for (const required of ['image','prompt','negativePrompt','seed','frames','width','height','fps']) {
    const binding = template.bindings[required];
    if (!binding || !targets(binding)?.length || targets(binding).some(b => !Array.isArray(b) || b.length !== 2 || !template.workflow[b[0]]?.inputs || !(b[1] in template.workflow[b[0]].inputs))) throw new Error(`Missing ComfyUI binding: ${required}`);
  }
}
export function buildComfyWorkflow(template: WorkflowTemplate, p: GenerationParams, uploaded: unknown) {
  validateWorkflow(template);
  const workflow = structuredClone(template.workflow);
  if (template.dimensions && !template.dimensions[p.aspectRatio]) throw new Error('Imported workflow does not configure this aspect ratio');
  const dimensions = template.dimensions?.[p.aspectRatio] || (p.aspectRatio === '1:1' ? [720,720] : p.aspectRatio === '9:16' ? [720,1280] : [1280,720]);
  const values: Record<string, unknown> = {
    image: uploaded, prompt: p.prompt, negativePrompt: p.negativePrompt,
    seed: p.seed ?? Math.floor(Math.random() * 2147483647),
    frames: Math.floor(p.durationSeconds * template.fps / template.frameMultiple) * template.frameMultiple + template.frameOffset,
    fps: template.fps, cfg: p.cfgScale,
    width: dimensions[0], height: dimensions[1],
  };
  if (template.maxFrames && Number(values.frames) > template.maxFrames) throw new Error('Requested duration exceeds imported workflow maxFrames');
  for (const [name, binding] of Object.entries(template.bindings)) for (const [node, input] of targets(binding)) {
    if (!(name in values) || !workflow[node]?.inputs || !(input in workflow[node].inputs)) throw new Error(`Invalid workflow binding: ${name}`);
    workflow[node].inputs[input] = values[name];
  }
  return workflow;
}
export async function submitComfyUIJob(p: GenerationParams, serverUrl: string, signal?: AbortSignal) {
  const raw = localStorage.getItem(`kinesis_workflow_${p.model.endpoint}`);
  if (!raw) throw new Error('Import a validated ComfyUI API workflow with input bindings for this model. Generic image samplers cannot generate video.');
  const template = JSON.parse(raw) as WorkflowTemplate; validateWorkflow(template);
  const base = serverUrl.replace(/\/$/, '');
  const response = await apiFetch(p.imageUrl.startsWith('https://') ? getProxiedMediaUrl(p.imageUrl) : p.imageUrl, {method:'GET',signal});
  const form = new FormData(); form.append('image', await response.blob(), `kinesis-${crypto.randomUUID()}.png`);
  const uploaded = await (await apiFetch(`${base}/upload/image`, {method:'POST',body:form,signal})).json();
  if (!uploaded.name) throw new Error('ComfyUI image upload returned no filename');
  const filename = uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name;
  const data = await (await apiFetch(`${base}/prompt`, {method:'POST',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:buildComfyWorkflow(template,p,filename),client_id:crypto.randomUUID()})})).json();
  if (!data.prompt_id) throw new Error(`ComfyUI rejected workflow: ${JSON.stringify(data.node_errors || data.error)}`);
  return {promptId:data.prompt_id as string};
}
export async function pollComfyUIJob(id: string, serverUrl: string, progress?: (msg: string)=>void, signal?: AbortSignal): Promise<string> {
  const base = serverUrl.replace(/\/$/, '');
  // Remove this job from the pending queue. Do not interrupt unrelated users' work.
  const cancel = () => { void apiFetch(`${base}/queue`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({delete:[id]})}).catch(()=>{}); };
  signal?.addEventListener('abort',cancel,{once:true});
  try {
    for (let i=0;i<300;i++) {
      await sleep(3000,signal);
      const history = await (await apiFetch(`${base}/history/${encodeURIComponent(id)}`,{method:'GET',signal})).json();
      const job = history[id]; progress?.(`ComfyUI: ${job?.status?.status_str || 'processing'}`);
      if (job?.status?.status_str === 'error') throw new Error(`ComfyUI execution failed: ${JSON.stringify(job.status.messages)}`);
      if (job?.status?.completed) {
        for (const output of Object.values(job.outputs) as Array<Record<string,Array<{filename:string;subfolder?:string;type?:string}>>>) {
          const file = [...(output.videos || []),...(output.gifs || []),...(output.images || [])].find(f=>/\.(mp4|webm)$/i.test(f.filename));
          if (file) return `${base}/view?${new URLSearchParams({filename:file.filename,subfolder:file.subfolder || '',type:file.type || 'output'})}`;
        }
        throw new Error('ComfyUI completed without an MP4/WebM video output');
      }
    }
    throw new Error('ComfyUI polling timed out');
  } finally { signal?.removeEventListener('abort',cancel); }
}
