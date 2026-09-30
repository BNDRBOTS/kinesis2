# Image Studio implementation and operation

Read [the investigation first](perchance-investigation.md). It distinguishes rendered behavior, author-confirmed provider evidence, authoritative API mechanics, and reconstruction choices. No PerchanceAI private endpoint, account, sample asset or credential is reused.

## Run it

1. Deploy the existing single Node service, or run `npm ci && npm run build && npm start` (Node 22+).
2. Configure `APP_PASSWORD` and `POLLINATIONS_API_KEY` on that server. These are server variables, **never VITE variables**. Sign into the studio with username `kinesis` and your chosen password.
3. For references, configure `PUBLIC_BASE_URL=https://your-studio-host` or Railway's `RAILWAY_PUBLIC_DOMAIN`. Pollinations must be able to fetch that public domain. A URL at localhost cannot serve remote reference inference.
4. Mount a persistent volume and set `MEDIA_DIR` to it. Without this, generated URLs are lost on redeployment. Use one server replica with this local storage architecture.
5. Open **Image Studio**. The catalogue reports configuration separately from model availability. It does not claim the key has successfully performed inference. If configuration changes, refresh the connection.
6. Select a workflow/model and enter a description. The starting default is **Z-Image Turbo / 3:4 / 1 / No Style / Safe on**. The target's visible SD XL default is displayed as unavailable, not falsely mapped to Z-Image.
7. For reference/sketch/headshot/edit modes, choose a reference-capable model such as Klein and upload a reference. Blend requires at least two references. The catalogue controls the actual per-model limit. Headshot additionally requires consent and a brief of at most 300 characters.
8. Review **Preview submitted prompt**; Generate. Each completed batch image is immediately available even if a later request fails. Download, Edit result, or Use as video frame.

`npm run dev` uses Vite's same-origin proxies for `/api`, `/image-outputs`, `/shared` and existing video `/outputs`. A standalone static Vite preview without the Node backend cannot generate images.

## Exact request path

```text
ImageStudio.tsx
  ├─ GET /api/images/catalog
  │    └─ GET https://gen.pollinations.ai/image/models
  ├─ POST /api/images/upload [raw image bytes]
  │    └─ MEDIA_DIR/shared/{uuid}.{png|jpg|webp} → opaque public /shared/ URL
  ├─ POST /api/images/enhance {prompt}
  │    └─ POST https://gen.pollinations.ai/v1/chat/completions
  │         Authorization: Bearer <server key>
  │         {model, messages:[system,user], stream:false, max_tokens:400}
  └─ POST /api/images/generate [one image request]
       ├─ shared imagePlan() validates settings and composes visible prompt
       ├─ live catalogue validates availability and reference capability
       └─ GET https://gen.pollinations.ai/image/{encoded prompt}
            ?model={canonical id}&width=…&height=…&safe=…
            [&seed=…][&image={public reference URLs joined with |}]
            Authorization: Bearer <server key>
            → image bytes → MEDIA_DIR/images/{uuid}.{extension}
            → {id,url,prompt,model,seed,width,height,createdAt}
```

There is no guessed provider job ID or polling API: the documented endpoint returns the final image bytes in the HTTP response. Batch generation is a sequence of one-image requests. The client posts to KINESIS even though the upstream endpoint is GET, so a general GET retry policy does not accidentally duplicate inference.

Each generated file is served through the authenticated `/image-outputs/` static route. The provider key is never in an image URL, HTML bundle or config response. No browser key field is added. Unauthenticated server-key spending is blocked unless APP_PASSWORD protection is enabled.

The current API accepts an `image` parameter for reference-capable models. We use that path rather than inventing separate sketch/headshot routes. Models in `shared/image-config.json`:

| UI label | Canonical model | Seed control in this integration |
|---|---|---|
| Z-Image Turbo | `tongyi-mai/z-image-turbo` | Yes; text-only in checked catalogue |
| Flux Schnell | `black-forest-labs/flux.1-schnell` | Yes; text-only in checked catalogue |
| FLUX.2 Klein 4B | `black-forest-labs/flux.2-klein-4b` | Yes |
| GPT Image 1 Mini | `openai/gpt-image-1-mini` | No reproducibility promise |
| Grok Imagine | `x-ai/grok-imagine-image` | No reproducibility promise |
| Qwen Image | `qwen/qwen-image` | No reproducibility promise |
| Wan Image | `alibaba/wan-2.7-image` | No reproducibility promise |

The backend caches catalogue capabilities for five minutes. It returns a small sanitized model list, not the full provider record. Failures do not invent an available catalogue. No fallback model is substituted when the requested model fails. Current API defaults supply quality/sampling parameters not exposed in KINESIS; unsupported steps, CFG and negative-prompt fields are not sent.

## Per-generator mechanics and tests

| Workflow | Mechanics | Validation |
|---|---|---|
| Text generation | Raw description + optional style suffix → chosen model; no reference required | Seven canonical-model cases and six full-path workflow cases in `tests/images.test.ts` |
| Reference transformation | Same engine plus public image URLs, with model input-capability checks | Reference-count/text-only rejection and uploaded-image tests |
| Sketch | Explicit composition/shape-preservation instruction + reference + description/style | Full Sketch client→HTTP→provider fixture test; no ControlNet claim |
| Headshot | Same-person instruction + style/purpose/background + brief; consent and reference required | Headshot full-path test and rendered UI consent/control test |
| Single edit | Chosen original instruction template + description; a source image is required | All 13 edit presets individually tested; full Edit path |
| Blend | Multiple public references joined with `|`, coherent-composition instruction | Full Blend path; minimum two and provider maximum enforced |
| Prompt enhancement | Separate text-model request; result replaces draft for review, does not automatically generate | Chat payload/response test and UI enhancement test |
| Result reuse | Private local result fetched by browser, reuploaded to an expiring public reference, submitted to reference-capable model | Full result→reference integration test |
| Image to video | Browser fetches generated image and converts it to a data URL before entering existing video studio | Uses existing tested video source-upload path; no new video inference backend |

Code locations:
- `shared/image-config.json`: model IDs, explicit shape sizes, style suffixes, original starting examples and 13 editing instructions.
- `shared/image-contract.mjs` and its TypeScript declaration: shared prompt construction, seed/shape/reference validation, deterministic URL encoding.
- `server/images.mjs`: authenticated API handlers, capability catalogue, upload/publication, provider authentication, response handling and bounded output storage.
- `src/api/imageStudio.ts`: sequential batch orchestration, reference publication, enhancement requests, abort support, partial-result callbacks.
- `src/components/ImageStudio.tsx`: workflow controls, model/shape/style/count, seed, safe toggle, upload/drop/URL, headshot controls/consent, prompt preview, original examples, saved prompts, scratchpad, gallery, download/re-edit/video handoff.
- `src/App.tsx`: Image Studio navigation while preserving the existing video/Comfy/provider studio.

## Prompt and preset boundaries

All suffixes, sketch/headshot/blend instructions, editing prompts and example descriptions are readable in the shared files. These are KINESIS-authored approximations of observed intents, not extracted site strings. The target's Showcase action is reproduced with four original starting examples that set prompt/style/model/shape together, not with unobserved prompt strings or copied images.

Headshot is one reference-generation call, not face-model training. Object/background removal, restoration, portrait polish and text edits are instruction-guided edits, not hidden specialized services. The “Enhance Image Detail” preset does not guarantee fixed-factor upscaling. A plain background is not a promise of transparent alpha. Generated identity and composition fidelity remain model-dependent.

## Safety, privacy, reliability

- Safe on explicitly requests `privacy,secrets,sexual,violence`; Safe off sends `false`. This is not a promise that a model is unrestricted or that filtering is infallible.
- UI count is 1–4, sequential. Blank seed chooses a random 31-bit integer; fixed seed advances per batch item. Seeds are omitted for unsupported models and output metadata uses `null` rather than promising reproducibility.
- Prompt cap: 4000 characters; headshot brief cap: 300. File cap: 24MiB. Server checks PNG/JPEG/WebP signatures and output MIME; SVG/HTML/JSON masquerading as a generated raster image is rejected.
- At most two inference/enhancement requests execute concurrently on one KINESIS server. Requests have a 180-second backend deadline and 200-second client deadline. There are no automatic generation retries.
- Cancel aborts browser fetch and the server's upstream request. This provider path exposes no separate cancel-job operation: abort does **not** guarantee already-started provider inference stops. Completed batch results remain available; canceled runs cannot publish late UI results.
- Upstream failures retain HTTP status with bounded details and key redaction. Invalid/missing outputs are errors, never mock production images. Writes use temporary files and atomic rename; interrupted writes are cleaned up.
- Generation origin is fixed; the client cannot specify an arbitrary upstream. Server-side provider redirects are rejected. Reference URLs must be HTTPS without credentials, IP literals or delimiter ambiguity; the downstream provider still owns its remote-fetch validation.
- Public references expire after 24 hours, using the existing shared-image route. Someone who obtains that opaque URL can read it before expiry. Generated outputs remain behind KINESIS authentication. No inference is performed on your local GPU.
- Gallery metadata stores at most 60 entries in browser localStorage; saved prompts at most 20. Image bytes persist on server disk. Clearing the list does not delete bytes; maintain/back up the volume and remove old shared/output files periodically.

## Verification qualification

Tests use real KINESIS HTTP handlers and a faithful **Pollinations API fixture**, with a real PNG file; they do not call the target site or infer its unobserved internal requests. The React tests exercise real controls and client batching against mocked HTTP responses. No `POLLINATIONS_API_KEY` is configured in this workspace, so no live AI image quality, identity fidelity, target-site parity, or actual provider generation success is claimed.

Run `npm ci && npx tsc --noEmit && npm run build && npm test && npm run smoke && npm audit && git diff --check`. These validate the complete repository, including existing Comfy and video behavior.
