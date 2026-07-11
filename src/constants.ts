import type { ModelDescriptor, Preset } from "./types";

export const MODEL_REGISTRY: ModelDescriptor[] = [
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
  {
    id: "fal-kling-v3-pro-i2v",
    label: "Kling v3 4K Pro (fal.ai)",
    provider: "fal",
    endpoint: "fal-ai/kling-video/v3/4k/image-to-video",
    maxDurationSeconds: 15,
    supportsSeed: false,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Top-tier 4K output with element references and multi-shot. Up to 15s per clip.",
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
    note: "O3-generation Kling model, high fidelity, ~318s gen time per 5s clip.",
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
    note: "O3 Standard -- ~3x faster than Pro at a lower price.",
  },
  {
    id: "fal-kling-v2-master-i2v",
    label: "Kling v2 Master (fal.ai)",
    provider: "fal",
    endpoint: "fal-ai/kling-video/v2/master/image-to-video",
    maxDurationSeconds: 10,
    supportsSeed: false,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Highest quality Kling v2 tier. 5-10s output.",
  },
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
    id: "replicate-wan-i2v",
    label: "Wan 2.1 I2V (Replicate)",
    provider: "replicate",
    endpoint: "wan-video/wan-2.1-i2v",
    maxDurationSeconds: 5,
    supportsSeed: true,
    supportsNegativePrompt: true,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Open-source Wan model. Supports seed locking for face consistency.",
  },
  {
    id: "runway-gen3a-turbo",
    label: "Gen-3 Alpha Turbo (Runway)",
    provider: "runway",
    endpoint: "gen3a_turbo",
    maxDurationSeconds: 10,
    supportsSeed: true,
    supportsNegativePrompt: false,
    aspectRatios: ["16:9", "9:16"],
    note: "Runway Gen-3 Alpha Turbo. 5 or 10s output. Seed supported.",
  },
  {
    id: "luma-ray2",
    label: "Ray-2 (Luma)",
    provider: "luma",
    endpoint: "ray-2",
    maxDurationSeconds: 9,
    supportsSeed: false,
    supportsNegativePrompt: false,
    aspectRatios: ["16:9", "9:16", "1:1"],
    note: "Luma Dream Machine Ray-2. Extend-capable. Up to 9s per call.",
  },
];

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
