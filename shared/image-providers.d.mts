export interface ImageCapabilities {
  textToImage:boolean;imageEditing:boolean;multiReference:boolean;maxReferences:number;
  seed:boolean;guidance:boolean;dimensions:boolean;steps:boolean;strength:boolean;negativePrompt:boolean;mask:boolean;
  promptTransforms:boolean;batch:boolean;safetyControl:boolean;referenceTransport:string;preserveSourceAspect:boolean;
  minDimension:number;maxDimension:number;
}
export const KLEIN_MODEL:{id:string;label:string;provider:string;credentialLabel:string;model:string;seed:boolean;capabilities:ImageCapabilities};
export const POLLINATIONS_CAPABILITIES:ImageCapabilities;
export function capabilitiesFor(model?:{id?:string;seed?:boolean;references?:number;capabilities?:ImageCapabilities}):ImageCapabilities;
export function sourceDimensions(width:number,height:number):[number,number];
export function kleinOptions(input:{prompt:string;width?:number;height?:number;seed?:number|null|string;guidance?:number|null},randomSeed?:()=>number):{prompt:string;width:number;height:number;seed:number;guidance?:number};
