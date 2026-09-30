export const KLEIN_MODEL = {
  id: 'cloudflare-klein', label: 'FLUX.2 Klein 4B · Cloudflare Workers AI',
  provider: 'cloudflare', credentialLabel: 'CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN', model: '@cf/black-forest-labs/flux-2-klein-4b', seed: true,
  capabilities: {
    textToImage: true, imageEditing: true, multiReference: true, maxReferences: 4,
    seed: true, guidance: true, dimensions: true, steps: false, strength: false,
    negativePrompt: false, mask: false, promptTransforms: false, batch: false,
    safetyControl: false, referenceTransport: 'binary', preserveSourceAspect: true,
    minDimension: 256, maxDimension: 1920,
  },
};
export const POLLINATIONS_CAPABILITIES = {
  textToImage: true, imageEditing: true, multiReference: true, maxReferences: 10,
  seed: true, guidance: false, dimensions: false, steps: false, strength: false,
  negativePrompt: false, mask: false, promptTransforms: true, batch: true,
  safetyControl: true, referenceTransport: 'url', preserveSourceAspect: false,
  minDimension: 256, maxDimension: 1920,
};
export function capabilitiesFor(model) {
  return model?.capabilities || (model?.id === KLEIN_MODEL.id ? KLEIN_MODEL.capabilities : {
    ...POLLINATIONS_CAPABILITIES, seed: model?.seed ?? true,
    maxReferences: model?.references ?? 10,
  });
}
// Normalize output (not reference) geometry without silently stretching extreme ratios.
export function sourceDimensions(width, height) {
  if (![width,height].every(n=>Number.isFinite(n)&&n>0)) throw new Error('Invalid source dimensions');
  const low=Math.max(256/width,256/height), high=Math.min(1920/width,1920/height);
  if(low>high) throw new Error('Source aspect ratio cannot fit 256–1920 on both sides. Select an output preset explicitly.');
  const scale=Math.min(high,Math.max(low,1024/Math.max(width,height)));
  return [Math.round(width*scale),Math.round(height*scale)];
}
export function kleinOptions(input, randomSeed = () => Math.floor(Math.random()*2147483648)) {
  if(typeof input.prompt!=='string'||!input.prompt.trim()||input.prompt.length>4000)throw new Error('Prompt must contain 1–4000 characters');
  const width=input.width ?? 1024, height=input.height ?? 768;
  if(![width,height].every(n=>Number.isInteger(n)&&n>=256&&n<=1920))throw new Error('Output width and height must be integers from 256 to 1920');
  const seed=input.seed === undefined || input.seed === null || input.seed === '' ? randomSeed() : input.seed;
  if(!Number.isInteger(seed)||seed<0||seed>2147483647)throw new Error('Seed must be an integer from 0 to 2147483647');
  const guidance=input.guidance;
  // Official docs specify a float, no numeric range. Do not invent a provider maximum.
  if(guidance!==undefined && guidance!==null && (typeof guidance!=='number'||!Number.isFinite(guidance)))throw new Error('Guidance must be a finite number');
  return {prompt:input.prompt,width,height,seed,...(guidance!==undefined&&guidance!==null?{guidance}:{})};
}
