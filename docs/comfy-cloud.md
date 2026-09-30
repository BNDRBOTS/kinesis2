# KINESIS → Comfy Cloud integration

Reviewed against official documentation on 2026-09-29. This implements **Comfy Cloud API v2**, not a localhost connection, not the deprecated v1 API, and not the separate Developer Platform deployment product.

## What was actually supported before this change

`src/api/comfyui.ts` treats the `comfyui` setting as a server URL, **not a key**. All generation requests originate in the browser, not the Railway backend:

1. Read the imported KINESIS workflow wrapper from browser storage.
2. Fetch input bytes; POST multipart `image` to `{base}/upload/image`.
3. Bind its returned `subfolder/name` string into the graph.
4. POST `{prompt, client_id}` to `{base}/prompt`.
5. Poll `{base}/history/{prompt_id}` every three seconds for up to 15 minutes.
6. Read nested history outputs and construct `{base}/view?filename=…`.
7. On abort, POST `{delete:[id]}` to `{base}/queue`. This removes queued work; it does not interrupt running GPU work.

There is no explicit provider authentication header, no Cloud API key, no Cloud endpoint translation, and no authenticated media download. Supported targets are classic ComfyUI servers implementing this protocol and reachable by the browser with appropriate CORS/network access. A remote GPU server works under those conditions; localhost means **the browser user's machine**, not Railway. An HTTPS studio cannot assume arbitrary HTTP LAN servers are accessible. Protected/authenticated deployments are not generically supported by this connector. Server-side frame/stitch requires an accessible HTTPS `/view` endpoint and `COMFYUI_MEDIA_ORIGIN` allowlisting.

It did **not** support Comfy Cloud, Comfy API deployments, or the v2 self-hosted proxy. Merely pasting a Cloud URL was not an integration.

## Incompatibility map and implemented changes

| Concern | Old connector | Cloud v2 requirement / implementation |
|---|---|---|
| Target | Arbitrary browser-supplied classic server | Fixed `https://cloud.comfy.org`, allowlisted paths in `server/comfy-cloud.mjs` |
| Authentication | None | Server `COMFY_CLOUD_API_KEY` → `Authorization: Bearer …`; APP_PASSWORD/session protects the studio |
| Browser security | Cross-origin direct requests | Same-origin `/api/comfy-cloud`; no localhost, no cross-origin API key exposure |
| Input upload | `/upload/image`, multipart `image` | `POST /api/v2/assets`, multipart `file`, `content_type`, `file_path` |
| Image input | Filename string | Typed `{"__type":"core/ASSET","info":{"id":"…"}}` in workflow |
| Submission | `/prompt`, `{prompt,client_id}` | `POST /api/v2/jobs`, `{workflow,extra_data}`; backend injects `api_key_comfy_org` for Partner nodes |
| Job identity | `prompt_id` | `id`, `urls.self`, `urls.cancel`; follow returned links after validating Cloud origin/path |
| Polling | Nested history map | GET returned self link; direct `status`, `progress`, `outputs`, `error` |
| Terminal states | `completed` / `error` | `succeeded`, `failed`, `canceled`, `expired`; unknown states fail explicitly |
| Cancellation | Pending queue deletion | POST returned per-job cancel link; running cancellation is cooperative at node/step boundaries |
| Output | `/view` filename | Authenticated output content link; backend handles its signed-storage 302 without forwarding credentials |
| Playback/history | Remote URL can expire or require a key | Copy original MP4/WebM bytes into `MEDIA_DIR`; return `/outputs/{uuid}.{ext}` for playback, range, download, frame extraction and stitching |
| Multiple samplers | One target per binding | One or many targets per binding, allowing both high/low-noise seeds and multiple FPS inputs |
| Geometry | Fixed 720p landscape/portrait | Optional per-aspect `dimensions`, square output, `maxFrames`, optional `outputNode`; preserves graph model names and sampler settings |
| Retry/billing | No Cloud contract | Bounded 429 Retry-After backoff; reuse one Idempotency-Key; never blindly replay ambiguous submissions |
| Errors | Classic history errors | Preserve HTTP 401/402/403/422/429/5xx, validation details and job errors; redact key from upstream text |
| Limits | 15-minute polling | 90-minute client deadline accommodates Pro's 60-minute runtime plus queue time; request timeout 120s, download limit 250MB |

**Important correction:** `X-API-Key` applies to Cloud **v1**. The current **v2** API uses **Bearer** authentication. v1 is deprecated; this adapter does not rely on it.

The new model entry is **Comfy Cloud — Imported Video Workflow**, provider `comfyCloud`. Existing self-hosted entries and other providers remain available. Cloud never silently falls back to a self-hosted server, localhost, demo, or another provider.

## Enable this integration in your KINESIS deployment

1. Use the repository's Node/Railway deployment (`npm ci`, `npm run build`, `npm start`), not only a static Vite page or the legacy edge handlers.
2. At [Comfy Cloud pricing](https://comfy.org/pricing/), select **Standard / Monthly ($20/month)** for the lowest listed month-to-month Cloud API subscription. Do not confuse the $16 effective annual rate with monthly billing.
3. Create a key in [Comfy Platform API Keys](https://platform.comfy.org/profile/api-keys).
4. In Railway → this service → Variables, set:
   ```text
   APP_PASSWORD=<your private studio password>
   COMFY_CLOUD_API_KEY=<your Comfy API key>
   MEDIA_DIR=/data
   ```
   Attach a persistent volume at `/data`, deploy the variable changes, and sign into KINESIS as `kinesis`. Do not use a `VITE_` variable or put the key in Git/chat.
5. The Comfy Cloud field now shows **Server configured (not live-verified)**. A boolean config flag confirms configuration, not subscription/key validity. Alternatively, a browser-entered Cloud key works through the same backend; it is stored unencrypted in that browser. Server configuration is preferred.
6. In the Cloud editor, open a preinstalled **Wan 2.2 Image-to-Video** template for inexpensive drafts. Run it successfully **on Cloud** before exporting. Keep its actual model names, LoRAs, sampler steps and output node. A random local export may refer to models/custom nodes Cloud does not have.
7. **File → Export Workflow (API)**. Do not use the canvas/UI export containing `nodes` and `links`.
8. Wrap the exported graph with the binding configuration below, then select **Comfy Cloud — Imported Video Workflow** in KINESIS and import the wrapper with its workflow upload control.
9. Select a ratio/duration your wrapper supports, upload an image, enter a prompt, and Generate. Disable optional Foley/upscale for a Cloud-only test. The original native audio is retained if the workflow generates it; silent Wan output remains silent unless optional audio is requested.
10. Confirm a Cloud job ID appears in progress, a video appears in KINESIS, download works, and Cloud's account usage shows the run. For a continuity check, generate two segments and check the second upload is the first segment's extracted final frame.

### Exact workflow-wrapper construction

The API export is a node-ID-keyed object. Identify inputs in **your export**, not node IDs from a different tutorial. Print its input names without running inference:

```sh
node --input-type=module -e 'import fs from "node:fs"; const g=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); for(const [id,n] of Object.entries(g)) console.log(id,n.class_type,Object.keys(n.inputs||{}).join(", "));' workflow_api.json
```

Create `bindings.json` using actual IDs. This is a schema example, **not an executable graph**:

```json
{
  "bindings": {
    "image": ["LOAD_IMAGE_ID", "image"],
    "prompt": ["POSITIVE_ENCODER_ID", "text"],
    "negativePrompt": ["NEGATIVE_ENCODER_ID", "text"],
    "seed": [["HIGH_NOISE_SAMPLER_ID", "noise_seed"], ["LOW_NOISE_SAMPLER_ID", "noise_seed"]],
    "frames": ["VIDEO_LATENT_ID", "length"],
    "width": ["VIDEO_LATENT_ID", "width"],
    "height": ["VIDEO_LATENT_ID", "height"],
    "fps": ["CREATE_VIDEO_ID", "fps"]
  },
  "fps": 18,
  "frameMultiple": 4,
  "frameOffset": 1,
  "maxFrames": 81,
  "dimensions": {"1:1": [640, 640]},
  "outputNode": "SAVE_VIDEO_ID"
}
```

Use the graph's real names: a sampler may expose `seed` rather than `noise_seed`, and a video node may expose `frame_rate` rather than `fps`. With one sampler use `["ID","seed"]`; with multiple downstream targets use an array of pairs. Bind FPS to every input that must agree. Optional `cfg` can be bound, but omitting it preserves the graph's tuned guidance rather than replacing it with KINESIS's generic value.

Combine the **actual** API graph and the mapping without copying model weights:

```sh
node --input-type=module -e 'import fs from "node:fs"; const [graph,bindings,out]=process.argv.slice(1); fs.writeFileSync(out,JSON.stringify({...JSON.parse(fs.readFileSync(bindings,"utf8")),workflow:JSON.parse(fs.readFileSync(graph,"utf8"))},null,2));' workflow_api.json bindings.json kinesis-cloud.json
```

Import `kinesis-cloud.json` into KINESIS. Validation checks referenced node inputs, dimensions and frame limits; Cloud remains the authority for node/model availability and graph execution. The wrapper requires image/prompt/negative-prompt/seed/frame/geometry/FPS controls; graphs without those controls need a corresponding supported graph, not fake bindings into unrelated inputs.

Frame calculation is `floor(seconds × fps / frameMultiple) × frameMultiple + frameOffset`. Set these to your tested graph's constraints. With the example, 4.5 nominal seconds produces 81 frames at 18 FPS. The current integer UI can use a **4-second** draft (73 frames); a 5-second request exceeds `maxFrames:81` and fails rather than quietly increasing cost. Increase `maxFrames` only after validating the larger graph on Cloud. Missing ratios in a supplied dimensions map are rejected. Generic Cloud UI controls are an envelope, not a claim every graph supports every length/ratio. LTX has different frame/size rules; do not reuse the Wan wrapper unchanged.

## Pricing, availability and execution constraints

Authoritative sources checked on the review date:

- [Cloud pricing](https://comfy.org/pricing/): five free browser runs, no card; Standard $20 monthly / $192 annual, Creator $35 monthly, Pro $100 monthly. Standard's annual allowance is 50,400 credits; its monthly allowance is 4,200. No API entitlement is inferred from the browser trial.
- [Cloud quickstart](https://docs.comfy.org/development/deploy/cloud): API workflow execution **requires a paid subscription**. A free browser account alone does not enable this KINESIS API path.
- [Usage and limits](https://docs.comfy.org/development/deploy/cloud-usage): API and editor use the same credit pool. Standard/Creator/Pro permit 1/3/5 concurrent workflows; pricing lists a queue of up to 100, max runtime 30/30/60 minutes. KINESIS submits segments sequentially, so Standard's one concurrent run is sufficient for one pipeline (other account jobs can still queue it).
- Pricing's low-cost benchmark is specifically Wan 2.2 I2V, **81 frames, 18 FPS, 640×640, four steps**, approximately 11 credits/run. 4,200/11 is roughly 380 runs; $20/380 ≈ $0.053 if the full monthly pool is used. This is a runtime estimate, not a flat per-request tariff or an LTX price. 81/18 is 4.5 seconds; the provider markets it as a “5s” benchmark.
- Standard uses preinstalled models; importing custom models/LoRAs requires Creator or higher. Pricing lists 900+ preinstalled models, not unrestricted installation of every local node/model.
- Official [Wan 2.2](https://docs.comfy.org/tutorials/video/wan/wan2_2) and [LTX-2.3](https://docs.comfy.org/tutorials/video/ltx/ltx-2-3) documentation links Cloud workflows. The Cloud stable release can lag newly published nodes. This is why the application imports an actual Cloud-tested graph instead of claiming its existing self-hosted model labels are guaranteed Cloud inventory.
- The separate Developer Platform has GPU-second and storage billing. It is **not** this fixed Cloud subscription adapter; no dedicated deployment is created or billed by this implementation.

## Where inference runs

| Path | Inference machine | Avoids your local inference GPU? |
|---|---|---|
| New Comfy Cloud selection | Comfy-managed cloud GPU (pricing currently lists RTX 6000 Pro, 96GB) | **Yes.** Fixed remote target; no local inference code/fallback |
| Classic connector to a remote ComfyUI GPU server | That remote server | Yes, if the selected URL truly points to remote hardware and its graph uses remote resources |
| Classic connector to localhost/your workstation | Your machine's ComfyUI compute device | **Not guaranteed; normally uses your GPU. Do not select for this requirement.** |
| Browser UI / Railway media processing | Browser image handling; server FFmpeg CPU for final frames/stitching | No model inference here. Browser video playback may use ordinary hardware decoding, which is not AI generation |

## Validation evidence and boundaries

`tests/comfy-cloud.test.ts` runs the actual browser-side adapter against a **real KINESIS HTTP server** with a spec-shaped upstream fixture. It checks:

- APP_PASSWORD authentication and server-only key → Bearer header;
- raw multipart fields through Express, typed asset references, graph translation, 81-frame/640-square settings, seed, partner-node credentials and idempotency header;
- queued → succeeded polling following returned links;
- authenticated content endpoint → signed-storage 302 → download without credentials → local output → real HTTP 206 range bytes;
- 401/402/403/422/500, failed/expired/canceled, missing output, pre-abort, cooperative job cancellation, 429 backoff/key reuse, foreign target/private redirect rejection;
- a two-segment run through the **real orchestrator**, real FFmpeg final-frame extraction and stitching, with uploaded extracted-frame bytes, seed continuity and retained audio.

The video bytes in these tests are generated by FFmpeg, **not AI inference**. The graph's FixtureVideo node is a protocol-test fixture, not an available Cloud model. Official v2 specification used: [Comfy-Org/docs/openapi-v2.yaml](https://github.com/Comfy-Org/docs/blob/7f225f5ebcc4e35ce5ec9110576dcbfb5c5fbd73/openapi-v2.yaml). The implementation is API-level tested, **not live-cloud-qualified**: `COMFY_CLOUD_API_KEY` was not configured in this workspace. No subscription purchase, account signup or paid run was performed.

Operational boundaries:

- Upstream submission network failure can leave an unknown remote outcome; check Cloud jobs before resubmitting. v2's Idempotency-Key is reject-on-duplicate, not replay. Closing the browser is not a durable queue/cancellation guarantee.
- Cancel requests do not guarantee immediate GPU stop or refund; failure to confirm cancellation is reported in progress.
- Download permits Cloud-issued HTTPS storage redirects on Google storage, AWS, Cloudflare R2 and Comfy domains, not arbitrary hosts. A new storage domain fails closed with an explicit error until reviewed. Subsequent storage redirects are rejected.
- Original downloaded outputs are copied without transcoding, preserving native audio. They need a persistent `MEDIA_DIR` volume and manual disk housekeeping. KINESIS postprocessing retains its existing bounds; outputs over 250MB or unsupported MIME fail clearly.
- No separate endpoint support is claimed for `*.run.comfy.app`, self-hosted v2 proxies, or the deprecated Cloud v1 API.
