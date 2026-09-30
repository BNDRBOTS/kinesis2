# Provider contract references

Reviewed 2026-09-29. These are official provider documents consulted for the implementation, not evidence of live execution. Fal queue responses are parsed using the returned status/result URLs; fallback URLs use the model application's owner/name root.

## Fal

The input and output schema for each implemented endpoint is available at its official model documentation:

- [LTX 2.5 Pro](https://fal.ai/models/lightricks/ltx-2.5/image-to-video/pro/llms.txt): duration 6/8/10; 720p/1080p; aspect auto/16:9/9:16; FPS 24/25/50; audio boolean; no seed/negative prompt. App pins 1080p/25 FPS, audio on.
- [LTX 2.5 Fast](https://fal.ai/models/lightricks/ltx-2.5/image-to-video/fast/llms.txt): 6–20 in even increments; 720p/1080p/1440p/2160p; FPS 24/25/48/50. At 1440p/2160p or 48/50 FPS, duration is limited to 10 seconds. App pins 1080p/25 FPS.
- [LTX 2.3 Pro](https://fal.ai/models/fal-ai/ltx-2.3/image-to-video/llms.txt): 6/8/10; 1080p/1440p/2160p; aspect auto/16:9/9:16; FPS 24/25/48/50. App pins 1080p/25 FPS. This replaces [deprecated LTX-2 Pro](https://fal.ai/models/fal-ai/ltx-2/image-to-video/api).
- [LTX 2.3 22B](https://fal.ai/models/fal-ai/ltx-2.3-22b/image-to-video/llms.txt): num_frames 9–481, video_size object, FPS 1–60, seed, negative prompt, native audio. App uses 24 FPS, 8n+1 frames, 1280×704 or 704×1280.
- [LTX-Video 13B distilled](https://fal.ai/models/fal-ai/ltx-video-13b-distilled/image-to-video/api): num_frames, frame_rate, 480p/720p, aspect ratio, seed and negative prompt. App uses 720p/24 FPS.
- [Legacy LTX-Video preview](https://fal.ai/models/fal-ai/ltx-video/image-to-video/api): prompt, image_url (768×512), negative_prompt and seed; **no duration/aspect/FPS payload fields**. Research-only model. Existing nominal six-second metadata is not a documented exact output duration.
- [Wan 2.2 A14B](https://fal.ai/models/fal-ai/wan/v2.2-a14b/image-to-video/llms.txt): num_frames 17–161, frames_per_second 4–60, seed, negative prompt, aspect and resolution. App uses 720p/16 FPS with interpolation off.
- [HunyuanVideo 1.5](https://fal.ai/models/fal-ai/hunyuan-video-v1.5/image-to-video/llms.txt): num_frames 1–121, seed, negative prompt, aspect 16:9/9:16; no submitted duration or FPS field. App uses 480p and nominal 24-FPS frame planning.
- [Kling v3 Pro](https://fal.ai/models/fal-ai/kling-video/v3/pro/image-to-video/llms.txt) and [Standard](https://fal.ai/models/fal-ai/kling-video/v3/standard/image-to-video/llms.txt): start_image_url, string duration 3–15, negative_prompt, cfg_scale and generate_audio. No aspect_ratio input field.
- [Kling v2.6 Pro](https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video/llms.txt): start_image_url, string duration 5/10, negative_prompt, generate_audio; no cfg_scale or aspect_ratio.
- [Kling O3 Pro](https://fal.ai/models/fal-ai/kling-video/o3/pro/image-to-video/llms.txt) and [Standard](https://fal.ai/models/fal-ai/kling-video/o3/standard/image-to-video/llms.txt): image_url, string duration 3–15, generate_audio; no negative_prompt/cfg_scale/aspect_ratio.
- [Kling v2 Master](https://fal.ai/models/fal-ai/kling-video/v2/master/image-to-video/llms.txt): image_url, string duration 5/10, negative_prompt, cfg_scale; no native audio switch.
- [MMAudio V2](https://fal.ai/models/fal-ai/mmaudio-v2/llms.txt): video_url, prompt, duration 1–30; returns `video.url`, not MP3. The old `/video-to-audio` suffix and speculative fallback endpoints were removed.
- [Topaz](https://fal.ai/models/fal-ai/topaz/upscale/video/llms.txt): video_url, model, upscale_factor, H264_output; returns video.url. App does not request target_fps.
- [Fal file handling](https://fal.ai/docs/documentation/model-apis/fal-cdn#uploading-files): server-side official `@fal-ai/client` storage.upload; no fabricated upload URL or credentials in bundle.

## Other providers

- [Replicate MiniMax Video-01 schema](https://replicate.com/minimax/video-01/api/schema): first_frame_image; no duration input.
- [Replicate WaveSpeed Wan 2.1 schema](https://replicate.com/wavespeedai/wan-2.1-i2v-720p/api/schema): image, prompt, aspect_ratio, seed, negative_prompt; no num_frames/FPS input.
- [Replicate Wan 2.7 schema](https://replicate.com/wan-video/wan-2.7-i2v/api/schema): first_frame, duration 2–15, resolution, seed, negative_prompt; no aspect_ratio input.
- [Replicate HTTP API](https://replicate.com/docs/reference/http): model predictions, prediction status/cancel, files multipart upload.
- [Runway API](https://docs.dev.runwayml.com/api/): `/v1/image_to_video`, `/v1/tasks/{id}`, Bearer authentication and `X-Runway-Version: 2024-11-06`; promptImage supports HTTPS/data URI (data URI max 5 MB). Prompt text max 1000, explicit pixel ratio, optional seed. App exposes 5/10 for Gen-4 Turbo and 2–10 for Gen-4.5. Gen-3 is retired and disabled.
- [Luma video generation](https://docs.lumalabs.ai/docs/video-generation): `/dream-machine/v1/generations`, model ray-2/ray-flash-2, keyframes.frame0 image URL, string duration, assets.video result. Local inputs need public hosting.
- [ComfyUI routes](https://docs.comfy.org/development/comfyui-server/comms_routes) and [official API example](https://github.com/comfyanonymous/ComfyUI/blob/master/script_examples/basic_api_example.py): upload/image, prompt, history, queue. Model graph contracts are supplied through imported, validated API workflows rather than invented universal nodes/checkpoints.


## Comfy Cloud v2

The new `comfyCloud` provider is separate from classic `comfyui`. See [the complete protocol audit, integration steps and limits](comfy-cloud.md). It targets `https://cloud.comfy.org/api/v2`, uses Bearer authentication, typed uploaded assets, jobs and authenticated output downloads. The Cloud selection runs remote inference only. Availability is determined by the imported Cloud-tested graph, not the legacy self-hosted model names.
