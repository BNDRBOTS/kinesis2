# PerchanceAI image workflows: evidence and implementation map

Investigation date: 2026-09-29. Target: **www.perchanceaigenerator.com**, not the unrelated perchance.org plugin platform. Scope: image generation and the image/reference/sketch/selfie/editor/model paths linked by the requested image-generator page. No billing investigation or integration.

## Investigation before implementation

1. Retrieved the requested page and its reference-image, sketch, selfie, photo-studio and editor paths through the web retrieval tool.
2. Attempted direct HTML retrieval with Node fetch and curl. The sandbox fails TLS establishment for this site (also for example.com); it yielded **no raw HTML, JS bundle, HAR or live generation request**. Rendered page retrieval is not evidence of internal fetch calls.
3. Searched public source. The site's author (`localoca5`) submitted its URL and stated that the app integrates **Pollinations' image generation API** in [pollinations/pollinations#6710](https://github.com/pollinations/pollinations/issues/6710). That submission provides no source repository. Public profile repositories did not expose the site's implementation. Do not confuse public perchance.org automation repositories with this site.
4. Retrieved the current authoritative Pollinations API docs, image query schema, image registry and public image catalogue. No generation credentials were used. These establish a supported implementation path, **not proof of the target site's exact current internal routes**.

## Observed workflow paths

| Target path | Directly observable behavior | KINESIS path |
|---|---|---|
| `/ai-image-generator` | Prompt; Enhance/Save/More; art style default No Style; shape default 3:4; count default 1; displayed model SD XL; safety on; upload or URL reference; scratchpad; advanced settings; private gallery; showcase preset buttons | Image Studio → Generate; style, shape, count, model, safety, seed, prompt enhancement, saved prompts, scratchpad, gallery |
| Model links under `/solutions/*-image-generator` | Flux, FLUX.2 Klein 4B, GPT Image 1 Mini, Grok Imagine, Qwen Image, Wan Image labels | Same shared engine with explicit model selection and capability checks; no separate guessed model endpoint |
| `/solutions/flux-klein-image-generator` | Returned a rendered 404 during this investigation | Do not claim that landing page works; Klein model API is independently documented |
| `/ai-image-generator-from-image` | Upload and style transformation; contains marketing text describing CV/StyleGAN/diffusion | Reference mode; no invented separate StyleGAN, object detector or super-resolution service |
| `/sketch-to-image` | Landing page links to image-from-image; upload a sketch and describe finish | Sketch mode = reference-image generation plus explicit sketch-preservation instruction; **not** an asserted ControlNet pipeline |
| `/ai-selfie-generator` | Landing page links to `/ai-photo-studio` | Headshot mode |
| `/ai-photo-studio` | Source portrait JPEG/PNG up to 24MB; brief max 300 chars; style/purpose/background; consent; browser-local gallery; default Professional Corporate / LinkedIn Profile / Studio Gray. Page explicitly mentions img2img / pollination | Headshot mode composes those controls into reference-generation prompt and requires consent. No face training or identity guarantee |
| `/ai-image-editor` | Single Image Edit / Multi-Image Blend; safe control; uploaded references; prompt edits; 13 popular-edit intents | Edit / Blend modes share the reference-image engine, with preset instructions and model reference-count validation |
| `/solutions/remove-object-from-photo-ai`, `ai-background-remover`, `ai-replace-background`, `ai-upscale-image`, `ai-restore-old-photo`, `ai-face-retouch`, `edit-selfies-with-ai`, `edit-text-in-image` | Editor explicitly describes these as intent pages pointing into the same live editor | Preset selection → shared Edit mode, not eight fabricated APIs |

Observed showcase styles include No Style, Casual Photo, Painted Anime, Cyberpunk, Concept Art, Digital Art and 3D Render. The reference landing page also lists oil painting, watercolor, pencil sketch, cartoon and vintage photo. Their **exact hidden prompt strings are not observable**. KINESIS uses original, transparent suffixes and shows the submitted prompt; it does not copy sample photos or imply pixel-identical output.

## Confirmed provider protocol

Authoritative references:
- [Pollinations APIDOCS](https://github.com/pollinations/pollinations/blob/c34810c8176d2ec755a0e193998a52634e07ed6b/APIDOCS.md), generation, authentication and model-catalogue sections only.
- [Image query schema](https://github.com/pollinations/pollinations/blob/main/gen.pollinations.ai/src/schemas/image.ts).
- [Image model registry](https://github.com/pollinations/pollinations/blob/main/shared/registry/image.ts).
- [Public live image catalogue](https://gen.pollinations.ai/image/models).

`GET https://gen.pollinations.ai/image/{encodeURIComponent(prompt)}` supports `model`, `width`, `height`, `seed`, `safe`, `quality`, and `image` (pipe-delimited public reference URLs). Response is **image bytes**, not a job ID. Therefore do not invent job polling. `Authorization: Bearer <key>` stays server-side. `GET /image/models` is public; KINESIS returns only capability metadata, omitting unrelated catalogue fields.

The current schema does **not** expose the old `negative_prompt` or `enhance` query fields. KINESIS must not pretend those controls are applied. Prompt enhancement is a separate documented `/v1/chat/completions` request with an explicit KINESIS-authored instruction, displayed for review before generation. Its exact correspondence to the target's Enhance button is unknown.

Documented seed support among the replicated labels: Flux Schnell, Z-Image Turbo, FLUX.2 Klein 4B. Other selected models ignore seed, so the UI disables that promise. Reference capability is checked against the live catalogue, not inferred from a label or presence of `/v1/images/edits` in supported endpoints. Z-Image and Flux Schnell are text-only in the checked catalogue. SD XL is visibly shown on the target but has **no established provider mapping** in this investigation; show it unavailable rather than route it to a different model invisibly.

## Reconstruction decisions (not target-source discoveries)

- KINESIS uses its own same-origin backend; it never hotlinks the target's private endpoints or copies its credentials/session.
- Shape mappings: 3:4→768×1024, 4:3→1024×768, 1:1→1024×1024, 9:16→576×1024, 16:9→1024×576. These are explicit KINESIS choices; exact target dimensions are unobserved.
- Batch count 1–4 is implemented as sequential single-image requests. Seeds advance per image for seed-capable models; a blank seed gets a generated integer that is saved. Target batch scheduling and exact seed policy are unknown.
- Styles and editor/headshot prompt templates are original approximations of observed intents. No hidden negative-prompt processing or unobserved model chain is asserted.
- Safe mode sends explicit `privacy,secrets,sexual,violence`; current Pollinations `safe=true` alone means privacy/secrets, not a complete image-content filter. Provider policy still applies regardless of the switch.
- Reference files are temporarily hosted at opaque, expiring `/shared/` URLs so the provider can fetch them. The user is told references leave the device. Gallery metadata is browser-local; generated image bytes are stored on the private KINESIS server, not claimed to exist only in-browser.
- Background removal here is a prompt-based clean backdrop, **not guaranteed transparent alpha**. Upscale preset is generative detail enhancement, **not a guaranteed 2×/4× upscaler**.
- The remote provider performs inference. The browser and Node server only prepare prompts, upload inputs, and save/display bytes. Existing video and Comfy Cloud paths are preserved; a generated image can become a video source frame.

## Unresolved observations

Exact target internal API routes, JS state logic, cookies/headers, prompt suffixes, enhancement model/system prompt, SD XL checkpoint/provider, hidden advanced controls, batching strategy, output response envelopes, and present per-model backend routing were not observable. This is an evidence-based behavioral reconstruction using the author-confirmed provider, **not an exact reverse-engineered clone**. A user-supplied redacted HAR or public source export can narrow these gaps without guessing.
