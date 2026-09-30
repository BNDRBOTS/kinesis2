import { useEffect, useRef, useState } from 'react';
import { KLEIN_MODEL, capabilitiesFor, sourceDimensions } from '../../shared/image-providers.mjs';
import { config, composeImagePrompt, type ImageInput } from '../../shared/image-contract.mjs';
import { generateImageBatch, enhanceImagePrompt, uploadEditorReference, referenceDimensions, type ImageResult, type ImageModel } from '../api/imageStudio';
import { apiFetch, fileToDataUrl } from '../api/helpers';
import { useLocalStorage } from '../hooks/useLocalStorage';

const control='w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white';
const button='rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800 disabled:opacity-40';
const modelChoices=[...config.models,KLEIN_MODEL];
const initial:ImageInput={width:1024,height:768,prompt:'',style:'No Style',mode:'generate',preset:'',model:'zimage',shape:'3:4',safe:true,seed:0,references:[],consent:false,portraitStyle:'Professional Corporate',purpose:'LinkedIn Profile',background:'Studio Gray'};
export default function ImageStudio({onUseVideo}:{onUseVideo:(url:string)=>void}) {
  const [input,setInput]=useState<ImageInput>(initial);
  const [models,setModels]=useState<ImageModel[]>([]);
  const [providers,setProviders]=useState<Record<string,boolean>>({});
  const [count,setCount]=useState(1),[seed,setSeed]=useState(''),[referenceUrl,setReferenceUrl]=useState('');
  const [gallery,setGallery]=useLocalStorage<ImageResult[]>('kinesis_image_gallery_v1',[]);
  const [saved,setSaved]=useLocalStorage<string[]>('kinesis_image_prompts_v1',[]);
  const [scratch,setScratch]=useLocalStorage<string>('kinesis_image_scratch_v1','');
  const [results,setResults]=useState<ImageResult[]>([]);
  const [busy,setBusy]=useState(false),[status,setStatus]=useState(''),[error,setError]=useState('');
  const active=useRef<AbortController|null>(null);
  const patch=(p:Partial<ImageInput>)=>setInput(old=>({...old,...p}));
  async function loadModels(signal?:AbortSignal) {
    try {const data=await(await apiFetch('/api/images/catalog',{method:'GET',signal})).json();signal?.throwIfAborted();setModels(data.models);setProviders(data.providers || {pollinations:data.configured});setError('');}
    catch(e){if(!signal?.aborted)setError(String(e));}
  }
  useEffect(()=>{const c=new AbortController();void loadModels(c.signal);return()=>{c.abort();const run=active.current;active.current=null;run?.abort();};},[]);
  const selected=models.find(m=>m.id===input.model);
  const definition=selected || modelChoices.find(m=>m.id===input.model);
  const caps=capabilitiesFor(definition);
  const configured=!!providers[selected?.provider || ('provider' in (definition || {}) ? (definition as typeof KLEIN_MODEL).provider : 'pollinations')];
  const maxRefs=caps.maxReferences;
  const countForModel=caps.batch?count:1;
  async function action(task:(signal:AbortSignal)=>Promise<void>) {
    if(active.current)return;
    const controller=new AbortController();active.current=controller;setBusy(true);setError('');
    try {await task(controller.signal);}
    catch(e){if(active.current===controller){setError(controller.signal.aborted?'Cancelled. Already generated images remain available.':e instanceof Error?e.message:String(e));setStatus(controller.signal.aborted?'Cancelled':'Error');}}
    finally {if(active.current===controller){active.current=null;setBusy(false);}}
  }
  const matchSource=(model=input.model,refs=input.references)=>action(async signal=>{
    const [width,height]=refs.length?sourceDimensions(...await referenceDimensions(refs[0],signal)):[1024,768];
    signal.throwIfAborted();patch({model,shape:'source',width,height});
  });
  const generate=(replay?:ImageInput)=>action(async signal=>{
    const chosenSeed=replay?.seed ?? (seed===''?crypto.getRandomValues(new Uint32Array(1))[0]%2147483648:Number(seed));
    if(!Number.isInteger(chosenSeed)||chosenSeed<0||chosenSeed>2147483647)throw new Error('Seed must be 0–2147483647 or blank');
    setResults([]);setStatus(`Generating 0/${replay?1:countForModel}`);let completed=0;
    await generateImageBatch({...replay || input,seed:chosenSeed},replay?1:countForModel,image=>{
      setResults(prev=>[...prev,image]);setGallery(prev=>[image,...prev].slice(0,60));setStatus(`Generated ${++completed}/${replay?1:countForModel}`);
    },signal);setStatus(`Complete — ${completed} image${completed===1?'':'s'}`);
  });
  const upload=(files:FileList|null)=>action(async signal=>{
    if(!files?.length)return;
    if(input.references.length+files.length>maxRefs)throw new Error(`At most ${maxRefs} references; none were uploaded. Remove extras explicitly.`);
    for(const file of Array.from(files)) {
      setStatus(`Uploading ${file.name}`);const ref=await uploadEditorReference(file,signal,caps.referenceTransport==='binary');signal.throwIfAborted();setInput(old=>{
        const next={...old,references:[...old.references,ref.url]};
        if(!old.references.length && caps.preserveSourceAspect && old.shape==='source' && ref.width && ref.height) {
          try {const [width,height]=sourceDimensions(ref.width,ref.height);return {...next,width,height};}
          catch(e){setError(String(e));return {...next,width:undefined,height:undefined};}
        }return next;
      });
    }setStatus('Reference uploaded');
  });
  let submitted='';try{submitted=caps.promptTransforms?composeImagePrompt(input):input.prompt;}catch{/* display validation on Generate */}
  const editResult=(image:ImageResult)=>{
    const originalModel=models.find(m=>m.id===image.modelId);
    const model=originalModel && capabilitiesFor(originalModel).maxReferences>0 ? originalModel.id : 'klein';
    const nextCaps=capabilitiesFor(models.find(m=>m.id===model));
    patch({mode:'edit',preset:'',references:[image.url],model,prompt:'Refine this image while preserving its subject and composition.',shape:nextCaps.preserveSourceAspect?'source':'3:4',width:image.width,height:image.height});
    window.scrollTo({top:0,behavior:'smooth'});
  };
  const showImage=(image:ImageResult)=><article key={image.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 space-y-3">
    <img src={image.url} alt={image.prompt} className="w-full max-h-96 rounded-lg object-contain" loading="lazy" />
    <p className="text-xs text-neutral-400">{image.model} · requested {image.width}×{image.height} · {image.seed===null?'seed unsupported':`seed ${image.seed}`}</p>
    <div className="flex flex-wrap gap-2">
      {image.options && <button className={button} disabled={busy} onClick={()=>void generate(image.options)}>Regenerate</button>}
      <a href={image.url} download className={button}>Download</a>
      <button className={button} disabled={busy} onClick={()=>editResult(image)}>Edit result</button>
      <button className={button} disabled={busy} onClick={()=>void action(async signal=>{const blob=await(await apiFetch(image.url,{method:'GET',signal})).blob();const url=await fileToDataUrl(blob);signal.throwIfAborted();onUseVideo(url);})}>Use as KINESIS Video Input</button>
    </div>
    {!!image.references?.length && <details><summary className="text-xs">Before / reference images</summary><div className="flex flex-wrap gap-2">{image.references.map((url,i)=><figure key={i}><img src={url} className="h-24 max-w-40 object-contain" alt={`Original image ${i}`}/><figcaption className="text-xs">Image {i}{i===0?' · Primary':''}</figcaption></figure>)}</div></details>}
    <details className="text-xs text-neutral-400"><summary>Submitted prompt</summary><p className="whitespace-pre-wrap mt-2">{image.prompt}</p></details>
  </article>;
  return <section className="space-y-6">
    <header className="space-y-2"><p className="text-xs uppercase tracking-widest text-sky-400">Remote image generation</p><h2 className="text-3xl font-bold">Image Studio</h2><p className="text-sm text-neutral-400">Create, transform, and refine images. Selected providers perform inference remotely; no local AI GPU execution.</p></header>
    {!configured&&<div className="rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-sm">Configure <code>{selected?.credentialLabel || 'POLLINATIONS_API_KEY'}</code> on the password-protected KINESIS server, then <button className="underline" onClick={()=>void loadModels()}>refresh connection</button>. No key is sent to this browser.</div>}
    <div className="grid gap-6 lg:grid-cols-[minmax(320px,420px)_1fr]">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 space-y-4">
        <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
          {caps.promptTransforms && <><label className="block text-sm">Try a starting point<select className={control} value="" onChange={e=>{const example=config.examples[Number(e.target.value)];if(example)patch({prompt:example.prompt,style:example.style,model:example.model,shape:example.shape,mode:'generate',preset:'',references:[]});}}><option value="">Choose an original example…</option>{config.examples.map((p,i)=><option key={p.title} value={i}>{p.title}</option>)}</select></label>
          <label className="block text-sm">Workflow<select className={control} value={input.mode} onChange={e=>patch({mode:e.target.value as ImageInput['mode'],preset:'',consent:false})}>{[['generate','Text to image'],['reference','Reference image'],['sketch','Sketch to image'],['headshot','Selfie / Headshot'],['edit','Single-image edit'],['blend','Multi-image blend']].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          {input.mode==='edit'&&<label className="block text-sm">Editing preset<select className={control} value={input.preset} onChange={e=>patch({preset:e.target.value,prompt:input.prompt||'Apply this edit naturally, preserving the important details.'})}><option value="">Custom edit</option>{config.presets.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}
          </>}
          <label className="block text-sm">Description<textarea className={control+' min-h-32'} maxLength={caps.promptTransforms&&input.mode==='headshot'?300:4000} value={input.prompt} onChange={e=>patch({prompt:e.target.value})} placeholder="Describe the subject, setting, light, and desired changes…" /></label>
          {caps.promptTransforms && <><div className="flex gap-2"><button className={button} disabled={!configured||!input.prompt.trim()} onClick={()=>void action(async signal=>{setStatus('Enhancing prompt');const prompt=await enhanceImagePrompt(input.prompt,signal);signal.throwIfAborted();patch({prompt:input.mode==='headshot'?prompt.slice(0,300):prompt});setStatus('Enhanced — review before generating');})}>Enhance</button><button className={button} disabled={!input.prompt.trim()} onClick={()=>setSaved(prev=>[input.prompt,...prev.filter(p=>p!==input.prompt)].slice(0,20))}>Save prompt</button></div>
          <label className="block text-sm">Art style<select className={control} value={input.style} onChange={e=>patch({style:e.target.value})}>{Object.keys(config.styles).map(s=><option key={s}>{s}</option>)}</select></label>
          </>}
          <div className="grid grid-cols-2 gap-3"><label className="text-sm">Shape<select className={control} value={input.shape} onChange={e=>{const shape=e.target.value;const dims=config.shapes[shape];if(shape==='source')void matchSource();else patch({shape,...(caps.dimensions&&dims?{width:dims[0],height:dims[1]}:{})});}}>{caps.preserveSourceAspect&&<><option value="source">Source aspect (default)</option><option value="custom">Custom dimensions</option></>}{Object.keys(config.shapes).map(s=><option key={s}>{s}</option>)}</select></label>{caps.batch&&<label className="text-sm">How many?<input className={control} type="number" min="1" max="4" value={count} onChange={e=>setCount(Number(e.target.value))}/></label>}</div>
          {caps.dimensions&&<div className="grid grid-cols-2 gap-3">{(['width','height'] as const).map(key=><label key={key} className="text-sm">{key==='width'?'Output width':'Output height'}<input className={control} type="number" min={caps.minDimension} max={caps.maxDimension} value={input[key] ?? ''} onChange={e=>patch({[key]:Number(e.target.value),shape:'custom'})}/></label>)}</div>}
          {caps.guidance&&<label className="block text-sm">Guidance<input className={control} type="number" step="any" value={input.guidance ?? ''} placeholder="Provider default" onChange={e=>patch({guidance:e.target.value===''?undefined:Number(e.target.value)})}/></label>}
          <label className="block text-sm">AI model<select className={control} value={input.model} onChange={e=>{const model=e.target.value;const next=capabilitiesFor(models.find(m=>m.id===model));patch({model,...(next.preserveSourceAspect?{shape:'source',style:'No Style',preset:'',mode:'generate',width:1024,height:768}:{shape:'3:4'})});if(next.preserveSourceAspect&&input.references.length)void matchSource(model);}}>{modelChoices.map(m=><option key={m.id} value={m.id} disabled={!models.find(l=>l.id===m.id)?.available}>{m.label}{models.find(l=>l.id===m.id)?.available?'':' — unavailable'}</option>)}<option disabled>SD XL — no verified provider mapping</option></select></label>
          <p className="text-xs text-neutral-400">{selected?.references||0} reference images supported. {selected?.seed?'Seed control supported.':'This model does not promise seeded reproducibility.'}</p>
          {caps.safetyControl&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={input.safe} onChange={e=>patch({safe:e.target.checked})}/>Safe generation</label>}
          <details className="text-sm"><summary>Advanced settings</summary><label className="block mt-3">Seed<input className={control} type="number" min="0" max="2147483647" disabled={!caps.seed} value={seed} onChange={e=>setSeed(e.target.value)} placeholder="Random for each run" /></label><button className={button} onClick={()=>setSeed('')}>Random Seed</button><p className="text-xs text-neutral-500 mt-2">Batch images advance the seed. No unsupported negative-prompt, CFG, or steps fields are sent.</p></details>
          {!caps.promptTransforms&&<p className="text-xs text-neutral-400">Prompt assistance: Keep image 0 identical in composition, identity, pose, lighting, and background; change only [REQUESTED CHANGE]. Your prompt is sent unchanged.</p>}
          <div className="space-y-2" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!busy)void upload(e.dataTransfer.files);}}><span className="text-sm">Reference images (drop files here)</span><input aria-label="Upload references" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{void upload(e.target.files);e.target.value='';}} className="w-full text-xs"/>{caps.referenceTransport==='url'&&<div className="flex gap-2"><input className={control} value={referenceUrl} onChange={e=>setReferenceUrl(e.target.value)} placeholder="Public HTTPS image URL" aria-label="Reference URL"/><button className={button} disabled={!referenceUrl.trim()||input.references.length>=maxRefs} onClick={()=>{patch({references:[...input.references,referenceUrl.trim()]});setReferenceUrl('');}}>Add</button></div>}<p className="text-xs text-neutral-500">JPEG / PNG / WebP, up to 24MB each. {caps.referenceTransport==='binary'?'Originals are stored privately at full resolution. Numbered provider copies fit within 511×511 without stretching.':'References are shared through an opaque public link that expires after 24 hours.'} The remote provider receives your references.</p>{input.references.map((ref,i)=><div key={i} className="flex items-center gap-2 text-xs"><img src={ref} alt={`Reference image ${i}`} className="w-16 h-16 object-contain"/><span className="truncate flex-1">Image {i}{i===0?' · Primary':''}</span><button className={button} onClick={()=>{const refs=input.references.filter((_,j)=>j!==i);patch({references:refs});if(i===0&&caps.preserveSourceAspect&&input.shape==='source')void matchSource(input.model,refs);}}>Remove</button></div>)}</div>
          {caps.promptTransforms&&input.mode==='headshot'&&<div className="space-y-3">{(['portraitStyle','purpose','background'] as const).map((key)=><label key={key} className="block text-sm">{({portraitStyle:'Headshot style',purpose:'Purpose',background:'Background'})[key]}<input className={control} maxLength={100} value={input[key]} onChange={e=>patch({[key]:e.target.value})}/></label>)}<label className="flex gap-2 text-xs"><input type="checkbox" checked={input.consent} onChange={e=>patch({consent:e.target.checked})}/>I own this photo or have permission to edit it, and consent to this AI transformation.</label></div>}
          <details className="text-sm"><summary>Saved prompts & scratchpad</summary><div className="space-y-2 mt-2">{saved.map((p,i)=><button key={i} className={button+' w-full truncate text-left'} onClick={()=>patch({prompt:p})}>{p}</button>)}<textarea className={control} value={scratch} onChange={e=>setScratch(e.target.value)} placeholder="Private notes (not submitted)"/><button className={button} onClick={()=>setSaved([])}>Clear saved prompts</button></div></details>
          <details className="text-sm"><summary>Preview submitted prompt</summary><pre className="whitespace-pre-wrap text-xs text-neutral-400 mt-2">{submitted||'Enter a valid description and required consent.'}</pre></details>
        </fieldset>
        <div className="flex gap-3"><button className="flex-1 rounded-xl bg-sky-500 px-4 py-3 font-bold text-white disabled:opacity-40" disabled={busy||!configured||!selected?.available} onClick={()=>void generate()}>{caps.promptTransforms?'Generate images':input.references.length?'Generate/Edit':'Generate images'}</button>{busy&&<button className={button} onClick={()=>active.current?.abort()}>Cancel</button>}</div>
        <p role="status" className="text-sm text-sky-300">{status}</p>{error&&<p role="alert" className="text-sm text-red-300 break-words">{error}</p>}
      </div>
      <div className="space-y-4"><h3 className="font-semibold">Result workspace</h3>{results.length?<div className="grid gap-4 sm:grid-cols-2">{results.map(showImage)}</div>:<div className="min-h-96 rounded-2xl border border-dashed border-neutral-700 flex items-center justify-center p-8 text-center text-neutral-500">Your generated images will appear here. Completed batch images remain available if a later image fails.</div>}<p className="text-xs text-neutral-500">Editing uses generative instructions: subject preservation is not guaranteed. Background cleanup is not guaranteed transparent alpha; detail enhancement is not a fixed-factor upscaler.</p></div>
    </div>
    <details className="rounded-2xl border border-neutral-800 p-5"><summary className="font-semibold">Private gallery · {gallery.length} images</summary><p className="text-xs text-neutral-500 my-3">Metadata stays in this browser. Image bytes live on your protected KINESIS server; use a persistent MEDIA_DIR volume. Clearing this list does not delete server files.</p><button className={button+' mb-4'} onClick={()=>setGallery([])}>Clear gallery list</button><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{gallery.map(showImage)}</div></details>
  </section>;
}
