# Verification record — 2026-09-29

## Executed successfully

- `npm ci`: clean lockfile install.
- `npx tsc --noEmit`: application type check.
- `npm run build`: Vite production build.
- `npm test`: **79 tests across 7 files**.
- `npm run smoke`: **65 assertions**, zero failures. Existing static assertions were updated where corrected implementations moved; its historical hand-written simulated payloads are not treated as real integration coverage.
- `npm audit`: zero reported npm vulnerabilities.
- `git diff --check`: no whitespace errors.
- Credential-pattern scan over tracked/new text: no matching private-key/token patterns. Environment inspection reported no configured Fal, Replicate, Runway or Luma credentials. This is not a guarantee from a dedicated secret-scanning service.
- Actual production Node entrypoint: `NODE_ENV=production`, explicit `PORT=3100`, test-only application password, listening on `0.0.0.0`.
- HTTP `/`: 401 without deployment authentication and **200 HTML** with authentication.
- HTTP `/healthz`: 200.
- Fal, Fal-file, Replicate, Runway, Luma: missing provider credentials 401, malformed payload 400.
- Media: missing/disallowed target 400.
- Media process: invalid payload 400.
- Upload: missing public-host configuration 503.
- Config: authenticated 200 with boolean credential availability, no secret values.
- Unknown API route: JSON 404; SPA routes serve the application.

## Coverage map

| Requirement | Executed coverage |
| --- | --- |
| Model-specific Fal payloads | `contracts.test.ts`, every selectable Fal registry model; duration/seed/negative/image-field differences |
| Other model regressions | Replicate, Runway and Luma real payload builders; all ComfyUI registry entries use imported graph bindings |
| Duration planning | `[3,3,2]`, `[10,5]`, discrete remainder rounding, invalid input, all model plans |
| Submit → poll → result | Real Fal client with mocked fetch; other provider polling; Comfy upload/submit/history with mocked HTTP |
| Multiple-segment chaining | Real orchestrator with mocked generation/media dependencies; previous final frame used, seed retained, clip control honored |
| Continuity errors | Extraction failure stops the run; no original-image fallback |
| Local/data-URL image | Actual data URI decoded into a Blob and submitted to mocked Fal storage HTTP; binary server upload test |
| Proxy/security | Real HTTP server, fixed paths/origins, denied arbitrary target, denied redirects, same-origin check, config secrets test |
| Binary/range/CORS | Byte-exact 206 body and range headers through real proxy with mocked CDN; actual output static range download |
| Cancellation | AbortSignal stops polling/HTTP, remote Fal cancellation requested, late callback cannot overwrite a newer React run |
| Single/stitch-on/stitch-off | Real orchestrator tests ensure usable output and correct stitch invocation |
| Foley/upscale | Success/failure tested independently; Foley failure does not block upscale; first-clip duration when stitching off |
| Final UI state | Hook reaches complete after optional failure, error on fatal failure, cancellation during stitching rejects stale updates |
| Media processing | **Actual FFmpeg/FFprobe**, generated red→blue fixture, final frame's RGB bytes checked blue; stitched result has audio and >2s duration |
| History/download | Output names inferred from MIME, ZIP failures surfaced; local output download exercised through HTTP |

## What was not executed

- **No paid live provider inference.** There are no configured provider credentials in this workspace. Endpoint/payload verification is documentation-based plus mocked integration tests, not proof that a particular provider account has model access, sufficient balance, capacity or moderation approval.
- **No live ComfyUI GPU generation.** Installed weights, custom-node versions and imported graphs must be validated on the operator's own GPU server. The import interface rejects missing bindings rather than fabricating a workflow.
- **No actual Railway deployment.** A Railway account/project was not connected through the available tools. The production entrypoint and HTTP paths were exercised locally; Railway settings are supplied in `railway.json` and README.
- No full browser-driven visual regression suite. React state tests run in jsdom; media encoding tests use real server-side FFmpeg rather than browser canvas/MediaRecorder.
- Legacy research-only LTX-Video exposes no duration setting. Its old nominal duration metadata is explicitly documented as an estimate; it is not a verified fixed-duration production model.

## Deployment prerequisites

Set a strong APP_PASSWORD and provider keys, generate a public domain, and attach a persistent volume for durable local output history. For ComfyUI, import a validated model-specific workflow and configure the exact HTTPS media origin. Provider output URLs can expire; archive/download important results.

## Comfy Cloud v2 integration — 2026-09-29

This supersedes the earlier suite counts above. Final command sequence after the Cloud implementation:

`npm ci && npx tsc --noEmit && npm run build && npm test && npm run smoke && npm audit && git diff --check`

All passed: **97 tests / 8 files**, **65 smoke assertions**, **0 audit vulnerabilities**. Build: 487.43 kB HTML / 135.96 kB gzip. No new runtime dependency was needed.

Added `tests/comfy-cloud.test.ts` (16 tests), one workflow-binding test, and the new provider's duration contract case. The Cloud suite crosses the real HTTP/auth/proxy boundary and tests v2 upload/submission/poll/output, error states, cancellation, backoff, authentication/redaction and redirect rejection. Its two-segment orchestrator test uses actual FFmpeg frame extraction, stitching and audio verification. See [Cloud audit and setup](comfy-cloud.md) for authoritative specification references and exact configuration.

**Qualification:** target-service responses are API fixtures; video bytes are real FFmpeg-generated fixtures, not AI-generated samples. No `COMFY_CLOUD_API_KEY` was available, so no paid/live Comfy Cloud generation, account subscription or inventory verification for a particular exported graph is claimed. Inference routing is statically fixed to Cloud; no local GPU execution path is called by the new provider.

## Image Studio reconstruction — 2026-09-29

Latest full verification supersedes prior counts: **154 tests across 10 files**, **65 smoke assertions**, **0 audit vulnerabilities**. `npm ci`, TypeScript, production build and `git diff --check` passed. Build: 508.62 kB HTML / 142.48 kB gzip.

Added 53 image protocol/workflow tests and four React UI tests. All six workflow modes traverse the actual client and real KINESIS HTTP backend with a documented Pollinations API fixture. Other cases cover seven model mappings, all 13 editing presets and 12 styles, shape/seed validation, reference capability checks, public uploads, result reuse, enhancement, cancellation, partial batches, output MIME/signatures, private output access and key redaction. UI tests cover count/seed batching and gallery storage, preset selection, enhancement review, headshot controls/consent, and cancellation reaching a terminal state.

The built Node server was started on port 3000, bound to 0.0.0.0. Native HTTP assertions confirmed root/bundle availability (including Image Studio), health 200, and unconfigured image inference 401 without contacting a generation endpoint.

No Pollinations credential was present; generation tests use PNG/API fixtures, not live AI inference. The site's raw frontend and network requests were not observable due sandbox TLS failures; [the investigation](perchance-investigation.md) records evidence and unknowns. The result is an evidence-based implementation of the observed workflows using the publicly identified provider, not a proven exact clone. No new dependencies were required.

## Cloudflare FLUX.2 Klein 4B — final integrated verification

The final repository sequence passed: `npm ci`, `npx tsc --noEmit`, `npm run build`, `npm test`, `npm run smoke`, `npm audit`, and `git diff --check`. **189 tests across 12 files**, including **31 Klein API/adapter tests and four Klein UI/integration tests**; **65 smoke assertions**, **0 audit vulnerabilities**. Build: 516.14 kB HTML / 144.89 kB gzip.

The production server started successfully with `NODE_ENV=production` on `0.0.0.0:3100` using a test-only studio password. Native HTTP checks confirmed health 200, authentication enforcement 401, built UI 200, and `POST /api/image-edit/cloudflare-klein` returning structured `missing_configuration` 503 when Cloudflare credentials are absent. The test server was then stopped. Happy-path multipart requests and Base64 responses were validated through the real production application handlers with injected API fixtures.

The real App UI test confirms **Use as KINESIS Video Input** changes the existing source-image state and navigates to the existing video studio, without a second editor/history/state system. Tests validate actual Sharp resizing, original-byte retention, four numbered reference files, source aspect handling, unsupported-field rejection, quota/auth/rate errors, cancellation and existing-provider regressions.

Neither `CLOUDFLARE_ACCOUNT_ID` nor `CLOUDFLARE_API_TOKEN` was available. No live generation, account upgrade or provider fallback was attempted. Cloudflare API responses in tests are mocked; HTTP handlers, binary parsing, image processing, storage, UI and video handoff are real. The new implementation and built bundle were scanned for embedded credential patterns and test secrets; no embedded credentials were found. See [the exact verified contract](cloudflare-klein.md).
