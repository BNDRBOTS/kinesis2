# KINESIS Automated Production Image-to-Video Studio

**KINESIS** is an elite, Production-Grade automated image-to-video orchestration platform tailored for professional creators. Tailored with a Sony/Apple/Nike sleek matte dark aesthetic, KINESIS completely overrides default AI provider duration limits (typically 5-10 seconds) by executing automated multi-clip generation loops, extracting intermediate anchor keyframes, and natively stitching concatenated deliverables entirely in the browser.

---

## 🚀 Key Deliverables & Architecture

### 1. Automated Multi-Clip Extension
Most state-of-the-art models (Wan 2.1, Kling v3, Hunyuan Video, MiniMax, and Runway Gen-3 Alpha) cap individual API outputs to avoid GPU VRAM timeouts. In KINESIS, you set a **Total Target Sequence Duration** (e.g. 30 or 60 seconds), and the engine automatically splits your timeline into optimal sequential slices.

### 2. HTML5 Canvas Keyframe Anchor (`extractLastFrame`)
As each video slice completes successfully, KINESIS loads the MP4 video into an invisible cross-origin HTML5 `<video>` element, seeks to `currentTime = duration - 0.05s`, captures the final image onto a `CanvasRenderingContext2D`, converts it to Base64/WebP, and automatically injects it as the starting prompt keyframe for the next slice.

### 3. Native WebM MediaRecorder Stream (`stitchVideos`)
Once all slices finish, KINESIS buffers the individual MP4 segments into a flawless HTML5 `canvas.captureStream(30)` stream fed directly into a high-bitrate `MediaRecorder` instance (`8_000_000` bps), producing a unified, single-file WebM master deliverable ready for immediate presentation.

### 4. Interactive Zip Packaging & Deliverables
Creators can download not only the Master Stitched WebM, but also pack all individual raw video MP4 chunks, matching AI Foley Sound Effects (`.mp3`), upscaled 4K MP4 deliverables, and an exact `execution_manifest.json` into an instant `.zip` package.

---

## 🎛️ Pipeline Feature Switches

KINESIS includes fully connected, production-ready switches accessible in the **Pipeline Switches** studio tab:

* `autoStitch`: Concatenates intermediate slices into a final master deliverable.
* `generateFoleyAudio`: Submits the final video sequence to `fal-ai/foley-sound-effects` to synthesize high-fidelity cinematic sound matching the exact on-screen motion.
* `aiUpscaleFinal`: Executes Topaz-grade AI AI Video Upscaling (`fal-ai/video-upscaler`) to enhance output resolution to crisp 4K / 60fps.
* `autoEnhancePrompt`: Automatically refines sparse user prompts by injecting professional lens (anamorphic 35mm), cinematic lighting (volumetric golden hour), and film stock specifications.
* `keepIntermediateSlices`: Preserves individual slice MP4s in the Local Vault.
* `enableGumroadGate` & `gumroadProductId`: Secures your production deployment behind a verifiable Gumroad license key portal (customizable in your dashboard).

---

## ⚡ Supported AI Generation Models

All API specifications strictly adhere to latest 2026 standards:

1. **Local / Self-Hosted ComfyUI**:
   * `comfyui-wan-2.1` (`workflow-wan` mapping)
   * `comfyui-hunyuan-1.5` (`workflow-hunyuan` mapping)
2. **fal.ai Serverless GPU**:
   * `fal-kling-v3-pro-i2v` (`fal-ai/kling-video/v3/4k/image-to-video`)
   * `fal-kling-o3-pro-i2v` (`fal-ai/kling-video/o3/pro/image-to-video`)
   * `fal-kling-o3-std-i2v` (`fal-ai/kling-video/o3/standard/image-to-video`)
   * `fal-kling-v2-master-i2v` (`fal-ai/kling-video/v2/master/image-to-video`)
3. **Replicate Serverless Edge**:
   * `replicate-minimax-video-01` (`minimax/video-01`)
   * `replicate-wan-i2v` (`wan-video/wan-2.1-i2v`)
4. **Runway Studio**:
   * `runway-gen3a-turbo` (`gen3a_turbo` via Gen-3 Alpha)
5. **Luma Dream Machine**:
   * `luma-ray2` (`ray-2` extendable)

---

## 💻 Installation & Self-Hosting Workflow

### Local Development
```bash
# 1. Install dependencies
npm install

# 2. Run the mobile-first production environment
npm run dev
```

### Vercel Serverless Production Deployment
KINESIS contains fully typed Vercel Serverless Edge proxies (`api/replicate.ts` and `api/runway.ts`) and a customized `vercel.json` routing configuration to enforce strict cross-origin CORS security boundaries automatically.
1. Push your repository to GitHub.
2. Import project into Vercel.
3. No environment variables required — all API tokens and custom Foley/Upscale switches are encrypted and securely stored entirely within your local browser `localStorage`.

---

## 🛡️ Best Practice & Security Policy
KINESIS executes zero third-party tracking or centralized database logging. Your uploaded source keyframe anchors, generated intermediate data URLs, and API credentials are kept 100% private to your client instance.
