# Cloudflare FLUX.2 Klein 4B in the existing Image Studio

## Verified provider contract

Official sources checked before implementation (2026-09-29):

- [Current model page](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/)
- [Raw input schema](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/schema-input.json): a `multipart` wrapper; it does not enumerate individual form fields.
- [Raw output schema](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/schema-output.json): `image`, a Base64 string.
- [Official model-specific parameter documentation](https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/): prompt, binary `input_image_0` through `_3`, guidance float, width/height integers 256–1920 (defaults 1024×768), seed integer. Fixed four inference steps; reference images must be smaller than 512×512.
- [Current Workers AI error codes](https://developers.cloudflare.com/workers-ai/platform/errors/): notably 3036 allocation exhaustion, 3040 capacity limiting, and 5035 account entitlement requirement.

The official docs do not state numeric guidance bounds or a seed range. KINESIS accepts finite guidance values, omits guidance when blank, and retains its existing nonnegative 31-bit seed envelope. These are not invented Cloudflare maxima. Prompt length (4000), upload size (24 MiB per image), decoded input pixel limit (40 million), response cap (40 MiB), and two concurrent requests are application safety limits.

## Configure and use

Set server variables on the existing production Node service:

```text
APP_PASSWORD=<your private studio password>
CLOUDFLARE_ACCOUNT_ID=<32-character Cloudflare account ID>
CLOUDFLARE_API_TOKEN=<token authorized for Workers AI>
MEDIA_DIR=/data
```

Use a persistent volume at `MEDIA_DIR`. Never use `VITE_*` variables for credentials. No Cloudflare account ID or token is stored in localStorage or returned by the catalogue.

Open the **existing Image Studio**, select **FLUX.2 Klein 4B · Cloudflare Workers AI** under AI model. No second editor, history, navigation or server is installed.

- Zero references: text-to-image.
- One reference: image editing; image 0 is primary.
- Two to four references: multi-reference editing, indexed 0–3 in the UI and outgoing request.
- Files are uploaded to the existing `/api/images/upload` route with `?private=true`; original bytes remain privately stored at full resolution. A public domain is **not** required for Cloudflare references.
- Output defaults to the primary source aspect ratio when a reference is present, normalized within 256–1920. Choose a preset or custom dimensions to override. Extreme ratios that cannot fit both dimension bounds without distortion require an explicit preset, rather than silent stretching. Pixel rounding is at most one pixel per dimension.
- Guidance is optional. Blank seed selects a random 31-bit seed; the actual seed is retained with the output. Regenerate replays the stored normalized options and references.
- Preservation prompt assistance is visible. The prompt is sent unchanged; style suffixes, preset/headshot transformations and hidden enhancement are disabled for this capability profile.
- The provider fixes inference at four steps. No steps, strength, negative prompt, CFG alias or mask is sent or exposed.

The existing Pollinations Klein remains a separate selectable model and continues to use its existing provider. It is never substituted for Cloudflare Klein.

## Integrated request and output lifecycle

`shared/image-providers.mjs` is the capability/validation record. `ImageStudio.tsx` renders controls from that metadata. `src/api/imageStudio.ts` dispatches the same batch/result contract to the dedicated `cloudflareKlein.ts` adapter for this model; existing providers retain their path.

The browser fetches selected original reference bytes and sends native FormData to:

```text
POST /api/image-edit/cloudflare-klein
```

The existing production Express server owns this route. It validates the private session, server configuration, multipart syntax, duplicate/unknown fields, prompt, dimensions, seed, finite guidance, MIME signatures, full image decoding and contiguous reference numbering. More than four images or missing reference indexes are errors; nothing is silently dropped. Supported originals are non-animated JPEG, PNG and WebP.

The server uses declared `sharp` to auto-orient and create PNG provider-input copies bounded by **511×511**, `fit: inside`, with no upscaling or cropping. The user's original bytes are not resized or overwritten. Proportions are maintained with normal integer-pixel rounding.

The dedicated adapter sends:

```text
POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-2-klein-4b
Authorization: Bearer {CLOUDFLARE_API_TOKEN}
```

Native FormData creates the multipart boundary. The adapter supplies no manual Content-Type. Only `prompt`, `width`, `height`, optional `guidance`, `seed`, and the ordered binary `input_image_N` parts are permitted. There are no redirects, automatic generation retries, provider fallbacks or account-plan mutation calls.

The REST response's `result.image` is strictly Base64-decoded. PNG/JPEG/WebP signatures determine the real MIME and extension; valid image metadata determines actual output dimensions. Invalid Base64, MIME mismatches, invalid image bytes and missing image results are errors.

Cloudflare results use the same normalized `ImageResult`, `/image-outputs/` storage, preview, download and browser gallery as Pollinations. Shared `server/image-storage.mjs` handles atomic writes for both. Results include original reference URLs and generation options for before/reference review and regeneration. Source uploads and results remain protected by KINESIS authentication. No browser object URLs are allocated; image bitmaps used to measure source dimensions are closed.

**Use as KINESIS Video Input** fetches the result once, converts it to a data URL in memory, calls the existing `onUseVideo` callback, updates `MainStudioFeed.sourceImageUrl`, and navigates to the existing Studio Feed. It does not download a file to the user or ask for re-upload. The existing video pipeline consumes that same source-image state.

## Errors, cancellation and account boundaries

Structured route errors contain `error.code`, `error.message`, and `provider: cloudflare`:

| Code | Meaning |
|---|---|
| `missing_configuration` | Missing account/token/private deployment protection |
| `invalid_upload` | Malformed multipart, image bytes/MIME/size/decode failure, numbering gap |
| `invalid_model_input` | Invalid prompt/options, unsupported/duplicate fields, upstream input rejection |
| `authentication_failed` | Cloudflare authentication, account/model permission denied |
| `quota_exhausted` | 3036 allocation exhaustion, HTTP 402, or 5035 entitlement requirement |
| `rate_limited` | KINESIS concurrency limit or Cloudflare rate/capacity limiting |
| `cloudflare_service_failure` | Upstream service/network/timeout/output failure |

Quota/entitlement errors stop the request. KINESIS never upgrades the account, opts into a plan, or falls back to another provider. Inference uses the account's existing Cloudflare settings; the adapter cannot promise an already-paid account's requests are free. No valid Cloudflare credentials were available for a live/free-allocation inference test.

Cancellation aborts client and server upstream requests. Already-started inference may continue at the provider; this endpoint does not expose a remote job-cancel operation. Storage remains subject to existing manual retention/volume housekeeping. Generated reference originals are retained for the gallery, not silently deleted when switching tabs.

## Deterministic verification

`tests/cloudflare-klein.test.ts` covers capabilities; text-only, single-reference and four-reference real HTTP paths; numbered binary parts; actual Sharp resizing/ratio/byte preservation; source geometry; dimension limits; finite guidance; fixed/random seed; omitted unsupported fields; strict Base64/MIME decoding; authentication, quota, rate, entitlement and service errors; malformed/oversized uploads; missing configuration; private outputs; and Cloudflare catalogue availability independent of Pollinations.

`tests/klein-ui.test.tsx` covers capability-driven controls, four numbered reference previews, source aspect default, explicit fifth-reference rejection, unchanged prompt/guidance/seed, common history/regeneration, and **a real rendered App test proving the result becomes the existing video source and navigation changes**.

All existing image, video, Comfy, state, media and HTTP tests remain in the final verification sequence. Upstream Cloudflare responses in automated tests are deterministic fixtures; reference resize, storage, HTTP middleware, multipart decoding and UI interactions are real. No live inference success or image-edit fidelity is claimed without credentials.
