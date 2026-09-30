import config from './image-config.json' with { type: 'json' };
export { config };
export function composeImagePrompt(input) {
  const { prompt, style = 'No Style', mode = 'generate', preset = '', portraitStyle = 'Professional Corporate', purpose = 'LinkedIn Profile', background = 'Studio Gray' } = input;
  if (typeof prompt !== 'string' || !prompt.trim() || /^\.{1,2}$/.test(prompt.trim()) || prompt.length > 4000) throw new Error('Enter a prompt of 1–4000 characters');
  if (!Object.hasOwn(config.styles, style)) throw new Error('Unknown art style');
  if (!['generate','reference','sketch','headshot','edit','blend'].includes(mode)) throw new Error('Unknown image workflow');
  const parts = [];
  if (mode === 'sketch') parts.push('Use the reference sketch as a composition and shape guide. Render the described finish while preserving the main layout.');
  if (mode === 'headshot') {
    if (!input.consent) throw new Error('Confirm permission and consent before transforming a portrait');
    if (prompt.length > 300) throw new Error('Headshot brief must not exceed 300 characters');
    for (const text of [portraitStyle,purpose,background]) if (typeof text !== 'string' || text.length > 100) throw new Error('Invalid portrait controls');
    parts.push(`Create a headshot of the same person. Preserve facial identity and natural proportions. Style: ${portraitStyle}. Purpose: ${purpose}. Background: ${background}.`);
  }
  if (mode === 'blend') parts.push('Combine the supplied reference images into one coherent composition according to the following instructions.');
  if (preset) {
    const item = config.presets.find(p => p.id === preset);
    if (!item || mode !== 'edit') throw new Error('Editing presets require Edit mode');
    parts.push(item.prompt);
  }
  parts.push(prompt.trim());
  if (config.styles[style]) parts.push(config.styles[style]);
  return parts.join('\n');
}
export function imagePlan(input) {
  const prompt = composeImagePrompt(input);
  const model = config.models.find(m => m.id === input.model);
  if (!model) throw new Error('Unsupported image model; SD XL has no verified mapping');
  if (!Object.hasOwn(config.shapes, input.shape)) throw new Error('Unsupported shape');
  if (typeof input.safe !== 'boolean') throw new Error('Safety setting must be explicit');
  if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 2147483647) throw new Error('Seed must be an integer from 0 to 2147483647');
  const references = input.references || [];
  if (!Array.isArray(references) || references.length > 10 || references.some(url => {
    try { const u = new URL(url); return u.protocol !== 'https:' || !!u.username || !!u.password || (u.port && u.port !== '443') || /[|,]/.test(url) || u.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.includes(':'); } catch { return true; }
  })) throw new Error('References must be public HTTPS image URLs (no URL credentials, IP literals, commas or pipes)');
  if (input.mode !== 'generate' && references.length < (input.mode === 'blend' ? 2 : 1)) throw new Error(input.mode === 'blend' ? 'Blend requires at least two reference images' : 'This workflow requires a reference image');
  const [width,height] = config.shapes[input.shape];
  const query = new URLSearchParams({ model:model.model, width:String(width), height:String(height), safe: input.safe ? 'privacy,secrets,sexual,violence' : 'false' });
  if (model.seed) query.set('seed',String(input.seed));
  if (references.length) query.set('image',references.join('|'));
  return { prompt, model, references, width, height, url:`https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${query}` };
}
