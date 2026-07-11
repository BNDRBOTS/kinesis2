export type Provider =
  | "comfyui"
  | "fal"
  | "replicate"
  | "runway"
  | "luma";

export interface ModelDescriptor {
  id: string;
  label: string;
  provider: Provider;
  endpoint: string;
  maxDurationSeconds: number;
  supportsSeed: boolean;
  supportsNegativePrompt: boolean;
  aspectRatios: string[];
  note: string;
}

export interface GenerationParams {
  model: ModelDescriptor;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  aspectRatio: string;
  seed: number | null;
  cfgScale: number;
  imageUrl: string;
}

export type SegmentStatus =
  | "queued"
  | "submitting"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface VideoSegment {
  id: string;
  index: number;
  status: SegmentStatus;
  remoteId: string | null;
  videoUrl: string | null;
  lastFrameUrl: string | null;
  error: string | null;
  pollCount: number;
  params: GenerationParams;
  createdAt: number;
}

export type PipelineStatus =
  | "idle"
  | "generating"
  | "stitching"
  | "complete"
  | "error";

export interface PipelineState {
  status: PipelineStatus;
  segments: VideoSegment[];
  stitchedUrl: string | null;
  targetDurationSeconds: number;
  error: string | null;
  audioUrl: string | null;
  upscaledUrl: string | null;
}

export interface ApiKeys {
  comfyui: string;
  fal: string;
  replicate: string;
  runway: string;
  luma: string;
}

export interface GumroadLicense {
  key: string;
  valid: boolean;
  checkedAt: number | null;
}

export interface Preset {
  id: string;
  title: string;
  category: "Cinematic" | "Action" | "Stylized" | "Experimental";
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  aspectRatio: string;
  cfgScale: number;
  imageUrl: string;
}

export interface FeatureSwitches {
  enableGumroadGate: boolean;
  gumroadProductId: string;
  autoStitch: boolean;
  keepIntermediateSlices: boolean;
  autoEnhancePrompt: boolean;
  generateFoleyAudio: boolean;
  foleyPrompt: string;
  aiUpscaleFinal: boolean;
}

export interface CreationHistoryItem {
  id: string;
  timestamp: number;
  title: string;
  prompt: string;
  negativePrompt: string;
  targetDurationSeconds: number;
  aspectRatio: string;
  modelLabel: string;
  stitchedUrl: string | null;
  audioUrl: string | null;
  upscaledUrl: string | null;
  segments: VideoSegment[];
}
