# KINESIS 2

Image-to-video studio built with React/Vite and a single Node service. The existing studio, feature switches, provider selection, presets, downloads and browser history remain available.

## Railway deployment

1. Deploy this repository as **one Railway service**. `railway.json` installs dependencies, builds Vite, and starts the Node server on `0.0.0.0:$PORT`.
2. Set **`APP_PASSWORD`** to a strong random password. Production startup requires it. Sign in with username **`kinesis`** and that password. This is a private, single-owner studio, not a multi-tenant SaaS.
3. Configure any provider credentials in Railway Variables (never `VITE_*` variables):
   - `FAL_KEY`
   - `REPLICATE_API_TOKEN`
   - `RUNWAYML_API_SECRET`
   - `LUMA_API_KEY`
   - `COMFY_CLOUD_API_KEY` (Comfy Cloud v2; remote inference)
   - `POLLINATIONS_API_KEY` (Image Studio; remote inference)
   - `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` (Image Studio → FLUX.2 Klein 4B · Cloudflare)
4. Generate a public Railway domain. `RAILWAY_PUBLIC_DOMAIN` is used for temporary image hosting; alternatively set `PUBLIC_BASE_URL=https://your-domain.example`. This allows Luma local-image/chained-frame inputs without another provider's storage key.
5. Attach a Railway volume at `/data` and set **`MEDIA_DIR=/data`** to retain archived segments and stitched MP4s across redeployments. Without a volume, local outputs are ephemeral.
6. Use one replica. The media worker permits two simultaneous operations. Budget RAM/disk for media workloads; generation itself runs on your configured provider, not Railway's CPU. `/healthz` is the public health check.

`npm start` runs `node server/index.mjs`. No global FFmpeg, Python, or undeclared runtime packages are needed: platform-specific FFmpeg/FFprobe binaries are installed from declared npm packages.

For an existing deployment, back up browser history and media before updating. Old blob URLs saved by previous versions cannot be recovered after their originating browser session closes.

## Development and verification

Requires Node 22 or newer.

```sh
npm ci
npx tsc --noEmit
npm run build
npm test
npm run smoke
PORT=3000 npm start
# In a second terminal for hot reload:
npm run dev
```

Vite proxies `/api` and `/outputs` to the Node server. Production serves the built application with SPA fallback; unknown `/api/*` paths return JSON 404s, not HTML.

The test suite executes actual payload builders, duration planning, HTTP proxy handlers, mocked provider clients, orchestration, cancellation and React pipeline state. It also generates a real two-color video fixture, extracts the final blue frame, stitches two clips with FFmpeg, verifies an audio stream remains, and downloads the result using an HTTP range request. **Provider generation tests are mocked; they are not paid live inference or GPU/ComfyUI qualification.** See [verification details](docs/verification.md).

## Image Studio

A separate **Image Studio** tab adds text-to-image, reference/sketch transformation, consent-based headshots, single-image edits and multi-image blends without replacing the video studio or Comfy integration. It uses Pollinations, the provider publicly identified by the author of the requested PerchanceAI site. This is an evidence-based reconstruction of observable workflows, **not a claim that inaccessible frontend internals were reverse-engineered exactly**.

Set `POLLINATIONS_API_KEY` on the password-protected Node/Railway server. For file references and re-editing generated images, also configure `PUBLIC_BASE_URL` or `RAILWAY_PUBLIC_DOMAIN`; the service must be publicly reachable by the provider. Keep `MEDIA_DIR` on a persistent volume. Reload the Image Studio catalogue after updating configuration.

The studio includes style/prompt presets, explicit submitted-prompt preview, prompt enhancement, batch images with seeds where supported, uploads/URL references, saved prompts/scratchpad, a gallery, downloads, edit-result reuse and **Use as video frame**. Live model capabilities are checked before inference; unavailable models and unsupported reference counts produce clear errors. The target's SD XL label is not silently mapped to a different model. Actual generation requires a valid configured provider key; tests do not substitute mock output in production.

See [investigation and evidence](docs/perchance-investigation.md) and [implementation/setup/test map](docs/image-studio.md). Browser gallery metadata is local, image bytes are on your server, and uploaded references are exposed by opaque 24-hour URLs for the provider to read. Existing video flows remain unchanged.

### Cloudflare FLUX.2 Klein 4B

The **same Image Studio** now includes **FLUX.2 Klein 4B · Cloudflare Workers AI**. Set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` on the protected server, then select that model. It supports text-only generation or 1–4 ordered references, guidance, output dimensions and seeds. No steps, strength, masks or negative-prompt fields are exposed/sent. Prompts pass unchanged.

Original images are kept full-resolution and private. The server creates proportional, auto-oriented provider copies below 512×512. Cloudflare returns Base64; KINESIS decodes and saves the actual image format into the existing preview/download/history flow. **Regenerate** reuses stored options; **Use as KINESIS Video Input** updates the existing video source directly. No public reference domain is required for this provider and no Pollinations key is needed. Existing Pollinations models retain their behavior.

See [Cloudflare Klein contract, setup and verification](docs/cloudflare-klein.md). Quota/rate/auth/input errors are distinct; no account upgrades or provider fallbacks are attempted. API configuration is not a claim of live inference verification.

## Models and contracts

Official documentation references and fixed application settings are recorded in [docs/providers.md](docs/providers.md).

- **LTX 2.5 Pro** is the default production selection: `lightricks/ltx-2.5/image-to-video/pro`, image URL + prompt, **6/8/10 seconds**, **1080p, 25 FPS**, landscape/portrait, native audio enabled. No seed or negative-prompt field is submitted because the endpoint exposes neither. The provider also supports 720p and 24/50 FPS, but these are not exposed as configurable controls here.
- **LTX 2.5 Fast**: 6–20 seconds in even increments at this application's 1080p/25 FPS setting. Higher-resolution/higher-FPS combinations are intentionally not selectable.
- **LTX 2.3 Pro** replaces the deprecated LTX-2 Pro endpoint under its existing saved model ID.
- **LTX 2.3 22B**, distilled LTX-Video, **Wan 2.2 A14B**, and **HunyuanVideo 1.5** use their own frame-based schemas, rather than an invented common duration field.
- Kling v3/v2.6/O3/v2 Master, Replicate MiniMax/Wan, Runway Gen-4 and Luma Ray models have model-specific request builders. The retired Runway Gen-3 entry is retained for recognition but disabled.
- The old LTX-Video preview is a research-only legacy endpoint, not the Pro model. It has no duration control; its nominal six-second planning entry is legacy metadata, not a provider duration guarantee.

### Duration and continuity

`src/duration.ts` is the one planner used by UI and execution. It honors the requested clip length. Continuous-duration examples are `[3,3,2]` for an 8-second target/3-second clips and `[10,5]` for a 15-second target/10-second clips.

Discrete models round each call **up to an allowed duration**. For example LTX Pro target 15 / clip 10 schedules `[10,6]`: 16 provider seconds, displayed before execution. It does not submit an unsupported 5-second request or pretend the result is exactly 15 seconds. Frame-based models include endpoint-specific frame rounding/anchor overhead; encoded duration can differ slightly from the nominal seconds.

Every chaining anchor comes from the generated video's final decoded frame. Frame extraction failure stops chaining with an error; it never substitutes the original image. A random seed is chosen once per run and reused when the model supports it. Provider submissions are not automatically retried, avoiding duplicate paid jobs after ambiguous network failures.

### Outputs, audio and history

- One segment is immediately usable without stitching.
- Stitching produces an H.264/AAC MP4, normalizing geometry and frame rate while retaining audio. Silent segments receive silent audio tracks for consistent concatenation.
- With stitching off, all slices remain individually downloadable and the first is the preview. **Optional processing applies to that preview, not to an unstitched sequence.**
- Keep-intermediate-slices archives provider clips through the media worker. If archival fails, the original provider URL remains available with a warning. Stitched files are stored under `MEDIA_DIR`.
- Foley uses MMAudio V2 and returns a **video with sound**, not an MP3. Its 30-second limit is checked; longer input is skipped with a warning while retaining the base video.
- Upscale uses Topaz Proteus at **2× spatial resolution**, H.264 output. It does not promise arbitrary input becomes 4K or 60 FPS. Foley and upscale can each be used alone; when both succeed, upscaling uses the Foley video. A Foley failure does not prevent upscaling the base video. Failure of either preserves successful video output.
- Browser history stores metadata and URLs, not permanent provider storage. Remote URLs can expire; download archives promptly. The Railway volume retains locally archived/stitched outputs. Clearing browser history does not delete volume files. Back up and periodically remove unneeded files from the volume; shared input images are inaccessible after 24 hours but should also be periodically deleted to reclaim disk.
- Downloads infer extension from response MIME/URL. ZIP generation reports missing assets instead of silently omitting failed downloads.

### Comfy Cloud (no local inference GPU)

Select **Comfy Cloud — Imported Video Workflow**, set `COMFY_CLOUD_API_KEY` on the protected Node/Railway service, and import a Cloud-tested API workflow with input bindings. This is a dedicated **v2** adapter: Bearer authentication, asset uploads/references, job submission/poll/cancel, and authenticated video downloads archived into `MEDIA_DIR`. It never falls back to local ComfyUI. Cloud API execution requires a paid subscription; the five free browser runs do not grant this API entitlement.

See **[Comfy Cloud integration, exact setup and validation](docs/comfy-cloud.md)** for the connector audit, API incompatibility map, workflow-wrapper commands, current pricing/limits, and test evidence. Protocol tests use spec-shaped fixtures; no live Comfy Cloud generation has been performed in this workspace.

### Self-hosted ComfyUI setup

ComfyUI requires your installed weights, custom nodes and a **GPU-tested API-exported video workflow**. The old guessed generic graphs were not valid universal video workflows. KINESIS no longer guesses checkpoint names or treats still-image output as video.

1. Export your working graph using ComfyUI **File → Export (API)**.
2. Wrap it in the following configuration, replacing node IDs/input names with those from **your actual graph**:

```json
{
  "workflow": { "YOUR_NODE_IDS": { "class_type": "YOUR_NODE_TYPE", "inputs": {} } },
  "bindings": {
    "image": ["LOAD_IMAGE_NODE", "image"],
    "prompt": ["POSITIVE_NODE", "text"],
    "negativePrompt": ["NEGATIVE_NODE", "text"],
    "seed": ["SAMPLER_NODE", "noise_seed"],
    "frames": ["VIDEO_LATENT_NODE", "length"],
    "width": ["VIDEO_LATENT_NODE", "width"],
    "height": ["VIDEO_LATENT_NODE", "height"],
    "fps": ["VIDEO_OUTPUT_NODE", "frame_rate"]
  },
  "fps": 24,
  "frameMultiple": 8,
  "frameOffset": 1
}
```

This illustrates the configuration format, **not an executable model graph**. Set FPS/frame constraints appropriate to your workflow. Import the JSON using the control shown when a ComfyUI model is selected. Bindings are validated before submission. Configure the ComfyUI server URL in the key panel; it must be reachable from your browser and permit your studio origin. For Railway frame extraction/stitching, set `COMFYUI_MEDIA_ORIGIN` to that server's exact HTTPS origin; only its `/view` route is allowed through the media worker.

ComfyUI cancellation removes the queued job; stopping browser polling cannot guarantee already-running GPU work is stopped. Do not use a public unauthenticated ComfyUI instance.

## Security and operating limits

Server credentials never enter the frontend bundle or `/api/config` responses. Optional browser-entered credentials are **unencrypted browser storage** and are sent through this server to the selected provider. Prefer server variables on the password-protected deployment.

Proxy origins and paths are constrained. Media accepts approved provider CDNs and, optionally, one administrator-configured ComfyUI `/view` origin. General media redirects are rejected rather than followed into private networks. The dedicated Comfy Cloud adapter permits one Cloud-issued signed-storage redirect to allowlisted HTTPS storage hosts, without forwarding the API key. Range/status/content headers and binary bodies are preserved. Media processing restricts input demuxers/protocols, sequence downloads to 500 MB, individual downloads to 250 MB, and output dimensions to 4096 pixels. Arbitrary image hosts may be rejected by the media proxy; upload the image locally instead.

Cancellation aborts local requests, polling, and active media subprocesses; Fal/Replicate/Runway cancellation is requested where supported. Remote providers may still bill work already started. Closing the browser is not a durable background job queue. The Gumroad switch is an optional client-side license UX, **not** backend authorization; APP_PASSWORD protects deployment access.

The `api/*.ts` files remain as legacy edge handlers. Railway uses `server/`, including the new media worker; the complete pipeline is not a Vercel Edge deployment.
