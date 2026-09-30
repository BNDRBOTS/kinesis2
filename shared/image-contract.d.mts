export interface ImageInput {
  width?:number; height?:number; guidance?:number;
  prompt: string; style: string; mode: 'generate'|'reference'|'sketch'|'headshot'|'edit'|'blend';
  preset: string; model: string; shape: string; safe: boolean; seed: number; references: string[];
  consent: boolean; portraitStyle: string; purpose: string; background: string;
}
export const config: {
  models: Array<{id:string;label:string;model:string;seed:boolean}>;
  examples: Array<{title:string;prompt:string;style:string;model:string;shape:string}>;
  shapes: Record<string,[number,number]>; styles: Record<string,string>;
  presets: Array<{id:string;label:string;prompt:string}>;
};
export function composeImagePrompt(input: ImageInput): string;
export function imagePlan(input: ImageInput): {prompt:string;model:typeof config.models[number];references:string[];width:number;height:number;url:string};
