import type { ModelDescriptor, Preset } from "./types";

const MODELS: ModelDescriptor[] = [
  { id: 'comfy-cloud-workflow', label: 'Comfy Cloud — Imported Video Workflow', provider: 'comfyCloud', endpoint: 'workflow-comfy-cloud', maxDurationSeconds: 10, supportsSeed: true, supportsNegativePrompt: true, aspectRatios: ['16:9','9:16','1:1'], note: 'Runs exclusively on Comfy Cloud GPUs. Paid Cloud API subscription required. Import a Cloud-tested video workflow; dimensions, frame limits and audio depend on that graph. No local inference.' },
  { id: 'fal-ltx-2.3-22b-i2v', label: 'LTX 2.3 22B I2V (fal.ai)', provider: 'fal', endpoint: 'fal-ai/ltx-2.3-22b/image-to-video', maxDurationSeconds: 20, supportsSeed: true, supportsNegativePrompt: true, aspectRatios: ['16:9','9:16'], nativeAudio: true, note: '24 FPS; 9–481 frames. Native audio, seed and negative prompt.' },
  { id: 'fal-wan-2.2-a14b-i2v', label: 'Wan 2.2 A14B I2V (fal.ai)', provider: 'fal', endpoint: 'fal-ai/wan/v2.2-a14b/image-to-video', maxDurationSeconds: 10, supportsSeed: true, supportsNegativePrompt: true, aspectRatios: ['16:9','9:16','1:1'], note: '720p, 16 FPS, 17–161 frames; silent video.' },
  { id: 'fal-hunyuan-1.5-i2v', label: 'HunyuanVideo 1.5 I2V (fal.ai)', provider: 'fal', endpoint: 'fal-ai/hunyuan-video-v1.5/image-to-video', maxDurationSeconds: 5, supportsSeed: true, supportsNegativePrompt: true, aspectRatios: ['16:9','9:16'], note: '480p, up to 121 frames; silent video.' },
  // === ComfyUI Local / Self-Hosted (Free, Cheap) ===
  {
    id: "comfyui-ltx-2.5",
    label: "LTX-2.5 I2V (Local ComfyUI - Cheap/Free)",
    provider: "comfyui",
    endpoint: "workflow-ltx-2.5",
    maxDurationSeconds: 10,
    supportsSeed: true,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Self-hosted LTX-2.5 via ComfyUI. Open weights, 10s, native audio, ~$0.04/s equivalent free locally. Best cheap/free backend.",
  },
  {
    id: "comfyui-ltx-video",
    label: "LTX-Video 0.9.7 13B Distilled (Local ComfyUI)",
    provider: "comfyui",
    endpoint: "workflow-ltx-video",
    maxDurationSeconds: 6,
    supportsSeed: true,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Ultra-fast local LTX Video distilled. Runs on 12GB VRAM, ~90s per 5s clip on 4090. Free.",
  },
  {
    id: "comfyui-wan-2.1",
    label: "Wan 2.1 I2V (Local ComfyUI)",
    provider: "comfyui",
    endpoint: "workflow-wan",
    maxDurationSeconds: 5,
    supportsSeed: true,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Self-hosted Wan 2.1 via ComfyUI. Requires local GPU and workflow JSON mapping.",
  },
  {
    id: "comfyui-hunyuan-1.5",
    label: "Hunyuan Video 1.5 (Local ComfyUI)",
    provider: "comfyui",
    endpoint: "workflow-hunyuan",
    maxDurationSeconds: 6,
    supportsSeed: true,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Self-hosted Hunyuan Video 1.5 via ComfyUI.",
  },

  // === fal.ai Serverless - LTX Cheap/Free Tier (Open Weights) ===
  {
    id: "fal-ltx-2.5-pro-i2v",
    label: "LTX-2.5 Pro I2V (fal.ai - Cheap)",
    provider: "fal",
    endpoint: "lightricks/ltx-2.5/image-to-video/pro",
    maxDurationSeconds: 10,
    supportsSeed: false,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Lightricks LTX-2.5 Pro: open-weights, native synced audio, 1080p, $0.06/s. Cheapest production quality.",
  },
  {
    id: "fal-ltx-2.5-fast-i2v",
    label: "LTX-2.5 Fast I2V (fal.ai - Ultra Cheap)",
    provider: "fal",
    endpoint: "lightricks/ltx-2.5/image-to-video/fast",
    maxDurationSeconds: 20,
    supportsSeed: false,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "LTX-2.5 Fast: distilled, 4K, up to 20s, $0.04/s. Fastest cheap iteration.",
  },
  {
    id: "fal-ltx-2-pro-i2v",
    label: "LTX-2 Pro I2V (fal.ai)",
    provider: "fal",
    endpoint: "fal-ai/ltx-2/image-to-video",
    maxDurationSeconds: 10,
    supportsSeed: false,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "LTX-2 Pro: 4K with audio, $0.06-0.24/s depending on res. Open source.",
  },
  {
    id: "fal-ltx-video-13b-distilled-i2v",
    label: "LTX-Video 13B Distilled (fal.ai - Cheapest)",
    provider: "fal",
    endpoint: "fal-ai/ltx-video-13b-distilled/image-to-video",
    maxDurationSeconds: 6,
    supportsSeed: false,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "LTX-Video 13B Distilled: ultra cheap, fast, 6s clips. Best for free-tier prototyping.",
  },
  {
    id: "fal-ltx-video-i2v",
    label: "LTX-Video I2V (fal.ai)",
    provider: "fal",
    endpoint: "fal-ai/ltx-video/image-to-video",
    maxDurationSeconds: 6,
    supportsSeed: false,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "LTX-Video 0.9.7: fast image-to-video, open weights, cheap.",
  },

  // === fal.ai Serverless - Kling Latest ===
  {
    id: "fal-kling-v3-pro-i2v",
    label: "Kling v3 Pro (fal.ai) - Latest",
    provider: "fal",
    endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
    maxDurationSeconds: 10,
    supportsSeed: false,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Top-tier Kling v3 Pro: cinematic, fluid motion, native audio, custom elements. 5-10s.",
  },
  {
    id: "fal-kling-v3-std-i2v",
    label: "Kling v3 Standard (fal.ai)",
    provider: "fal",
    endpoint: "fal-ai/kling-video/v3/standard/image-to-video",
    maxDurationSeconds: 10,
    supportsSeed: false,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Kling v3 Standard: multi-shot, high quality, $0.084/s. Balanced cost.",
  },
  {
    id: "fal-kling-v2.6-pro-i2v",
    label: "Kling v2.6 Pro (fal.ai)",
    provider: "fal",
    endpoint: "fal-ai/kling-video/v2.6/pro/image-to-video",
    maxDurationSeconds: 10,
    supportsSeed: false,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Kling v2.6 Pro: cinematic with native audio $0.14/s. Production ready.",
  },
  {
    id: "fal-kling-o3-pro-i2v",
    label: "Kling O3 Pro (fal.ai)",
    provider: "fal",
    endpoint: "fal-ai/kling-video/o3/pro/image-to-video",
    maxDurationSeconds: 15,
    supportsSeed: false,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "O3-generation Kling model, high fidelity, 15s, custom elements, ~318s gen time per 5s clip.",
  },
  {
    id: "fal-kling-o3-std-i2v",
    label: "Kling O3 Standard (fal.ai)",
    provider: "fal",
    endpoint: "fal-ai/kling-video/o3/standard/image-to-video",
    maxDurationSeconds: 15,
    supportsSeed: false,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "O3 Standard -- ~3x faster than Pro at lower price, 15s.",
  },
  {
    id: "fal-kling-v2-master-i2v",
    label: "Kling v2 Master (fal.ai) - Legacy",
    provider: "fal",
    endpoint: "fal-ai/kling-video/v2/master/image-to-video",
    maxDurationSeconds: 10,
    supportsSeed: false,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Legacy Kling v2 Master tier. 5-10s output. Prefer v3 or v2.6 for new work.",
  },

  // === Replicate Serverless Edge ===
  {
    id: "replicate-minimax-video-01",
    label: "MiniMax Video-01 (Replicate)",
    provider: "replicate",
    endpoint: "minimax/video-01",
    maxDurationSeconds: 6,
    supportsSeed: false,
    supportsNegativePrompt: false,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "MiniMax Hailuo model via Replicate. ~6s clips.",
  },
  {
    id: "replicate-wan-2.1-720p-i2v",
    label: "Wan 2.1 720p I2V (Replicate - Updated)",
    provider: "replicate",
    endpoint: "wavespeedai/wan-2.1-i2v-720p",
    maxDurationSeconds: 5,
    supportsSeed: true,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Wan 2.1 14B accelerated 720p via WaveSpeed. Fast, open weights, seed lock.",
  },
  {
    id: "replicate-wan-2.7-i2v",
    label: "Wan 2.7 I2V (Replicate - Latest)",
    provider: "replicate",
    endpoint: "wan-video/wan-2.7-i2v",
    maxDurationSeconds: 10,
    supportsSeed: true,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Latest Wan 2.7: first/last frame control, clip continuation, audio sync, 27B MoE.",
  },

  // === Runway Studio - Updated to Gen-4 ===
  {
    id: "runway-gen4-turbo",
    label: "Gen-4 Turbo (Runway) - Current",
    provider: "runway",
    endpoint: "gen4_turbo",
    maxDurationSeconds: 10,
    supportsSeed: true,
    supportsNegativePrompt: false,
    aspectRatios: ["16:9", "9:16", "1280:720", "720:1280"],
    note: "Runway Gen-4 Turbo: current production model, 5-10s, $0.05/s. Replaces Gen-3 Alpha (retired July 2026).",
  },
  {
    id: "runway-gen4.5",
    label: "Gen-4.5 (Runway) - Latest",
    provider: "runway",
    endpoint: "gen4.5",
    maxDurationSeconds: 10,
    supportsSeed: true,
    supportsNegativePrompt: false,
    aspectRatios: ["16:9", "9:16", "1280:720", "720:1280"],
    note: "Runway Gen-4.5: native audio, multi-shot, up to 10s (60s in app), $0.12/s. Latest Dec 2025.",
  },
  {
    id: "runway-gen3a-turbo-legacy",
    label: "Gen-3 Alpha Turbo (Runway) - Legacy",
    provider: "runway",
    endpoint: "gen3a_turbo",
    maxDurationSeconds: 10,
    supportsSeed: true,
    supportsNegativePrompt: false,
    aspectRatios: ["16:9", "9:16"],
    note: "Legacy Gen-3 Alpha Turbo - retired July 30 2026. Use Gen-4 Turbo instead.",
  },

  // === Luma Dream Machine ===
  {
    id: "luma-ray2",
    label: "Ray-2 (Luma) - Standard",
    provider: "luma",
    endpoint: "ray-2",
    maxDurationSeconds: 9,
    supportsSeed: false,
    supportsNegativePrompt: false,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Luma Dream Machine Ray-2. Extend-capable. 5 or 9s per call, 720p/1080p/4K.",
  },
  {
    id: "luma-ray-flash-2",
    label: "Ray-Flash-2 (Luma) - Fast/Cheap",
    provider: "luma",
    endpoint: "ray-flash-2",
    maxDurationSeconds: 9,
    supportsSeed: false,
    supportsNegativePrompt: false,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Luma Ray Flash 2: faster, cheaper than Ray-2, 540p/720p, 5 or 9s.",
  },
  {
    id: "luma-ray2-flash",
    label: "Ray-2 Flash (Luma)",
    provider: "luma",
    endpoint: "ray-flash-2-720p",
    maxDurationSeconds: 9,
    supportsSeed: false,
    supportsNegativePrompt: false,
    aspectRatios: ["16:9", "9:16"],
    note: "Ray-2 Flash 720p variant: fast iteration.",
  },
];

// Contracts verified against official Fal model schemas (see docs/providers.md).
export const MODEL_REGISTRY: ModelDescriptor[] = MODELS.map(model => {
  if (model.provider === 'comfyui') return { ...model, aspectRatios: ['16:9','9:16'], note: 'Requires an imported, GPU-tested API workflow, installed weights/custom nodes, and input bindings. Audio depends on the supplied workflow.' };
  if (model.endpoint.includes('ltx-2') && !model.endpoint.includes('22b')) return {
    ...model,
    ...(model.id === 'fal-ltx-2-pro-i2v' ? { endpoint: 'fal-ai/ltx-2.3/image-to-video', label: 'LTX 2.3 Pro I2V (fal.ai)' } : {}),
    ...(model.provider === 'fal' ? {
      supportsSeed: false, supportsNegativePrompt: false, nativeAudio: true,
      aspectRatios: ['16:9', '9:16'],
      durations: model.endpoint.endsWith('/fast') ? [6,8,10,12,14,16,18,20] : [6,8,10],
      note: 'Native audio; 1080p / 25 FPS. Pro: 6, 8 or 10 seconds. No seed or negative-prompt control.',
    } : {}),
  };
  if (model.provider === 'luma') return { ...model, durations: [5,9] };
  if (model.provider === 'runway') return { ...model, durations: model.endpoint === 'gen4.5' ? [2,3,4,5,6,7,8,9,10] : [5,10], note: model.endpoint === 'gen3a_turbo' ? 'Retired model; select Gen-4 Turbo.' : 'Runway I2V; seed supported. No negative prompt or native audio control.' };
  if (model.endpoint.includes('kling-video')) return { ...model, nativeAudio: !model.endpoint.includes('/v2/'), supportsNegativePrompt: !model.endpoint.includes('/o3/'), maxDurationSeconds: model.endpoint.includes('/v3/') ? 15 : model.maxDurationSeconds, durations: model.endpoint.includes('/o3/') || model.endpoint.includes('/v3/') ? [3,4,5,6,7,8,9,10,11,12,13,14,15] : [5,10] };
  if (model.endpoint.includes('wan-2.1-i2v')) return { ...model, durations: [5] };
  if (model.endpoint.includes('wan-2.7')) return { ...model, maxDurationSeconds: 15, durations: Array.from({length:14}, (_,i)=>i+2) };
  if (model.endpoint === 'minimax/video-01') return { ...model, durations: [6] };
  if (model.endpoint.includes('ltx-video') && model.provider === 'fal') return { ...model, supportsSeed: true, ...(model.endpoint === 'fal-ai/ltx-video/image-to-video' ? { durations: [6], aspectRatios: ['3:2'], note: 'Legacy research-only preview. Fixed provider duration and 768×512 input.' } : {}) };
  if (model.provider === 'fal') return { ...model, durations: Array.from({length:model.maxDurationSeconds}, (_,i)=>i+1) };
  return model;
});

export const DEFAULT_PROMPT = "";
export const DEFAULT_NEGATIVE_PROMPT = "blur, distort, low quality, watermark, overexposed, bad anatomy, artificial feel";
export const DEFAULT_DURATION_SECONDS = 5;
export const DEFAULT_ASPECT_RATIO = "16:9";
export const DEFAULT_CFG_SCALE = 0.5;
export const DEFAULT_TARGET_DURATION = 15;

export const POLL_INTERVAL_BASE_MS = 4000;
export const POLL_INTERVAL_MAX_MS = 15000;
export const POLL_MAX_ATTEMPTS = 300;

export const LS_KEY_API_KEYS = "kinesis_api_keys";
export const LS_KEY_GUMROAD = "kinesis_gumroad_license";
export const LS_KEY_CREATION_HISTORY = "kinesis_creation_history";
export const LS_KEY_FEATURE_SWITCHES = "kinesis_feature_switches";

// Stunning visual assets for presets and demo evaluation
export const MOCK_CREATOR_PRESETS: Preset[] = [
  {
    id: "cinematic-drone",
    title: "Cinematic FPV Mountain Ridge",
    category: "Cinematic",
    prompt: "Cinematic drone FPV sweeping fast over jagged snow-capped mountain ridges during golden hour, majestic sun flares piercing through wispy clouds, 8k resolution, raw photorealistic lighting, dynamic motion.",
    negativePrompt: "low bitrate, jerky camera, motion blur, overexposed sky, artificial saturation",
    durationSeconds: 5,
    aspectRatio: "16:9",
    cfgScale: 0.6,
    imageUrl: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "cyberpunk-walk",
    title: "Cyberpunk Alley Tracking Shot",
    category: "Action",
    prompt: "Smooth handheld tracking shot behind a mysterious hooded figure walking down a rain-slicked cyberpunk street crowded with flickering neon holographic advertisements, glowing blue and magenta puddle reflections.",
    negativePrompt: "cartoonish, low contrast, static noise, distorted faces",
    durationSeconds: 5,
    aspectRatio: "16:9",
    cfgScale: 0.5,
    imageUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "film-noir",
    title: "35mm Vintage Film Portrait",
    category: "Stylized",
    prompt: "Slow delicate cinematic push-in on a classic film noir detective lit by sharp window blinds, subtle cigarette smoke curling upwards, genuine 35mm film grain, anamorphic lens distortion, moody shadows.",
    negativePrompt: "digital crispness, vibrant colors, modern artifacts, flat lighting",
    durationSeconds: 5,
    aspectRatio: "9:16",
    cfgScale: 0.45,
    imageUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "macro-fluid",
    title: "Liquid Gold Ferrofluid Swirl",
    category: "Experimental",
    prompt: "Extreme macro slow-motion of metallic gold and obsidian ferrofluid reacting to a magnetic pulse, forming intricate shifting iridescent geometric spires with pristine specular highlights.",
    negativePrompt: "unfocused, blurry, pixelated, plain background",
    durationSeconds: 5,
    aspectRatio: "1:1",
    cfgScale: 0.7,
    imageUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1000&q=80",
  }
];

// Fallback demo video URLs for evaluation simulation if the user clicks the explicit demo simulation button
export const MOCK_DEMO_VIDEOS = [
  "https://assets.mixkit.co/videos/preview/mixkit-aerial-view-of-a-mountain-range-4364-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-futuristic-city-with-flying-vehicles-42353-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-waterfall-in-forest-2213-large.mp4"
];
