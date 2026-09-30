// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import ImageStudio from '../src/components/ImageStudio';
import { config } from '../shared/image-contract.mjs';
const models=config.models.map(m=>({...m,available:true,references:m.id==='flux'||m.id==='zimage'?0:10}));
const result=(n=1)=>({id:'fixture-'+n,url:`/image-outputs/11111111-1111-4111-8111-11111111111${n}.png`,prompt:'A lighthouse',model:'tongyi-mai/z-image-turbo',seed:42+n-1,width:768,height:1024,createdAt:Date.now()});
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals();});
async function mount(handler?:(url:string,init:any)=>Promise<Response>){
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:any)=>url==='/api/images/catalog'?Response.json({configured:true,models}):handler?handler(url,init):Response.json(result())));
  render(<ImageStudio onUseVideo={vi.fn()}/>);
  await waitFor(()=>expect((screen.getByText('Generate images') as HTMLButtonElement).disabled).toBe(false));
}
it('batches from UI, publishes output, stores gallery metadata and exposes submitted prompt',async()=>{
  const submissions:any[]=[];await mount(async(_url,init)=>{submissions.push(JSON.parse(init.body));return Response.json(result(submissions.length));});
  fireEvent.change(screen.getByLabelText('Description'),{target:{value:'A lighthouse'}});
  fireEvent.change(screen.getByLabelText('How many?'),{target:{value:'2'}});
  fireEvent.change(screen.getByLabelText('Seed'),{target:{value:'42'}});
  fireEvent.click(screen.getByText('Generate images'));
  await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Complete — 2 images'));
  expect(submissions.map(s=>s.seed)).toEqual([42,43]);expect(submissions[0]).toMatchObject({safe:true,shape:'3:4',model:'zimage'});
  expect(JSON.parse(localStorage.getItem('kinesis_image_gallery_v1')!)).toHaveLength(2);
  expect(screen.getAllByText('Download')).toHaveLength(4); // workspace and private gallery
});
it('preset examples populate explicit settings and enhancements are reviewable before generation',async()=>{
  const calls:string[]=[];await mount(async(url)=>{calls.push(url);return Response.json({prompt:'A serene mountain range at sunrise.'});});
  fireEvent.change(screen.getByLabelText('Try a starting point'),{target:{value:'0'}});
  expect((screen.getByLabelText('Shape') as HTMLSelectElement).value).toBe('4:3');
  fireEvent.click(screen.getByText('Enhance'));
  await waitFor(()=>expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('A serene mountain range at sunrise.'));
  expect(calls).toEqual(['/api/images/enhance']);
  fireEvent.click(screen.getByText('Save prompt'));expect(JSON.parse(localStorage.getItem('kinesis_image_prompts_v1')!)).toEqual(['A serene mountain range at sunrise.']);
});
it('headshot controls include consent and compatible references in the actual request',async()=>{
  const submissions:any[]=[];await mount(async(_url,init)=>{submissions.push(JSON.parse(init.body));return Response.json(result());});
  fireEvent.change(screen.getByLabelText('Workflow'),{target:{value:'headshot'}});
  fireEvent.change(screen.getByLabelText('AI model'),{target:{value:'klein'}});
  fireEvent.change(screen.getByLabelText('Description'),{target:{value:'Natural friendly portrait'}});
  fireEvent.change(screen.getByLabelText('Reference URL'),{target:{value:'https://reference.example/selfie.png'}});fireEvent.click(screen.getByText('Add'));
  fireEvent.click(screen.getByLabelText(/I own this photo/));fireEvent.click(screen.getByText('Generate images'));
  await waitFor(()=>expect(submissions).toHaveLength(1));expect(submissions[0]).toMatchObject({mode:'headshot',consent:true,portraitStyle:'Professional Corporate',purpose:'LinkedIn Profile',background:'Studio Gray',references:['https://reference.example/selfie.png']});
  await waitFor(()=>expect(screen.getByRole('status').textContent).toContain('Complete'));
});
it('cancellation reaches a terminal UI state and does not publish stale results',async()=>{
  let began=false;await mount(async(_url,init)=>{began=true;return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));});
  fireEvent.change(screen.getByLabelText('Description'),{target:{value:'A lighthouse'}});fireEvent.click(screen.getByText('Generate images'));
  await waitFor(()=>expect(began).toBe(true));fireEvent.click(screen.getByText('Cancel'));
  await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('Cancelled'));
  expect(screen.queryAllByText('Download')).toHaveLength(0);expect((screen.getByText('Generate images') as HTMLButtonElement).disabled).toBe(false);
});
