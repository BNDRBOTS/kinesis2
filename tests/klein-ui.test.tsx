// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import ImageStudio from '../src/components/ImageStudio';
import App from '../src/App';
import { KLEIN_MODEL } from '../shared/image-providers.mjs';
import { config } from '../shared/image-contract.mjs';
const model={...KLEIN_MODEL,available:true,configured:true,references:4};
const url='/image-outputs/11111111-1111-4111-8111-111111111111.png';
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aBZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals();});
function wire() {
  const submitted:FormData[]=[];let uploads=0;
  vi.stubGlobal('fetch',vi.fn(async(path:string,init:any={})=>{
    if(path==='/api/config')return Response.json({});
    if(path==='/api/images/catalog')return Response.json({providers:{cloudflare:true,pollinations:true},models:[...config.models.map(m=>({...m,provider:'pollinations',available:true,references:10})),model]});
    if(path==='/api/images/upload?private=true')return Response.json({url:`/image-outputs/22222222-2222-4222-8222-22222222222${uploads++}.jpg`,width:1200,height:600});
    if(path.startsWith('/image-outputs/'))return {ok:true,blob:async()=>new Blob([png],{type:'image/png'})};
    if(path==='/api/image-edit/cloudflare-klein') {
      submitted.push(init.body);
      const options={model:KLEIN_MODEL.id,prompt:init.body.get('prompt'),width:1024,height:512,seed:Number(init.body.get('seed')),guidance:3.5,shape:'custom',mode:'generate',references:[],style:'No Style',preset:'',safe:true,consent:false,portraitStyle:'',purpose:'',background:''};
      return Response.json({id:'result-'+submitted.length,url,model:KLEIN_MODEL.model,modelId:KLEIN_MODEL.id,provider:'cloudflare',width:1024,height:512,seed:options.seed,prompt:options.prompt,createdAt:1,options});
    }
    throw new Error('Unexpected path '+path);
  }));
  return submitted;
}
async function choose(){await waitFor(()=>expect((screen.getByLabelText('AI model') as HTMLSelectElement).options.length).toBeGreaterThan(1));fireEvent.change(screen.getByLabelText('AI model'),{target:{value:KLEIN_MODEL.id}});await waitFor(()=>expect(screen.getByLabelText('Guidance')).toBeTruthy());}
it('existing editor renders only supported Klein generation controls from capabilities',async()=>{
  wire();render(<ImageStudio onUseVideo={vi.fn()}/>);await choose();
  expect(screen.getByLabelText('Guidance')).toBeTruthy();expect(screen.getByLabelText('Output width')).toBeTruthy();expect(screen.getByLabelText('Seed')).toBeTruthy();
  for(const label of ['Art style','How many?','Safe generation','Reference URL','Steps','Strength','Negative prompt','Workflow'])expect(screen.queryByLabelText(label)).toBeNull();
  expect(screen.getByText(/Keep image 0 identical/)).toBeTruthy();expect((screen.getByLabelText('Shape') as HTMLSelectElement).value).toBe('source');
});
it('four references remain numbered, preserve source aspect, and the fifth is not silently dropped',async()=>{
  const submitted=wire();render(<ImageStudio onUseVideo={vi.fn()}/>);await choose();
  const files=Array.from({length:4},(_,i)=>new File([png],`ref${i}.png`,{type:'image/png'}));
  fireEvent.change(screen.getByLabelText('Upload references'),{target:{files}});
  await waitFor(()=>expect(screen.getAllByAltText(/Reference image/)).toHaveLength(4));
  expect((screen.getByLabelText('Output width') as HTMLInputElement).value).toBe('1024');expect((screen.getByLabelText('Output height') as HTMLInputElement).value).toBe('512');
  expect(screen.getByText('Image 0 · Primary')).toBeTruthy();expect(screen.getByText('Image 3')).toBeTruthy();
  await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('Reference uploaded'));
  fireEvent.change(screen.getByLabelText('Upload references'),{target:{files:[files[0]]}});
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('At most 4'));
  expect(screen.getAllByAltText(/Reference image/)).toHaveLength(4);
  fireEvent.change(screen.getByLabelText('Description'),{target:{value:'Use image 1 in image 0. Keep the rest unchanged.'}});
  fireEvent.click(screen.getByText('Generate/Edit'));
  await waitFor(()=>expect(submitted).toHaveLength(1));
  for(let i=0;i<4;i++)expect(submitted[0].get('input_image_'+i)).toBeInstanceOf(File);
  expect(submitted[0].has('width')).toBe(false); // backend derives ratio from original, not a stale preset
});
it('seed/guidance are sent unchanged and regenerate uses the same normalized history contract',async()=>{
  const submitted=wire();render(<ImageStudio onUseVideo={vi.fn()}/>);await choose();
  fireEvent.change(screen.getByLabelText('Description'),{target:{value:'Only add a red hat.'}});
  fireEvent.change(screen.getByLabelText('Seed'),{target:{value:'42'}});fireEvent.change(screen.getByLabelText('Guidance'),{target:{value:'3.5'}});
  fireEvent.click(screen.getByText('Generate images'));await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Complete'));
  expect(submitted[0].get('prompt')).toBe('Only add a red hat.');expect(submitted[0].get('seed')).toBe('42');expect(submitted[0].get('guidance')).toBe('3.5');
  expect(JSON.parse(localStorage.getItem('kinesis_image_gallery_v1')!)[0].provider).toBe('cloudflare');
  fireEvent.click(screen.getAllByText('Regenerate')[0]);await waitFor(()=>expect(submitted).toHaveLength(2));expect(submitted[1].get('seed')).toBe('42');
  await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Complete'));
  fireEvent.click(screen.getByText('Random Seed'));expect((screen.getByLabelText('Seed') as HTMLInputElement).value).toBe('');
});
it('Klein result flows into the REAL App video source state and navigates to existing Studio Feed',async()=>{
  wire();render(<App/>);
  fireEvent.click(screen.getByRole('button',{name:'Image Studio'}));await choose();
  fireEvent.change(screen.getByLabelText('Description'),{target:{value:'A lighthouse'}});fireEvent.click(screen.getByText('Generate images'));
  await waitFor(()=>expect(screen.getAllByText('Use as KINESIS Video Input').length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByText('Use as KINESIS Video Input')[0]);
  await waitFor(()=>expect(screen.getByAltText('Uploaded source').getAttribute('src')).toMatch(/^data:image\/png;base64,/));
  expect(screen.getByText('Source Keyframe Image')).toBeTruthy();expect(screen.queryByText('Result workspace')).toBeNull();
});
