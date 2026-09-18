import type { GenerationParams } from "../types";
import { dataUrlToBase64, apiFetch, sleep } from "./helpers";

function dataUrlToBlob(dataUrl: string): Blob {
  const base64 = dataUrlToBase64(dataUrl);
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const mimeMatch = dataUrl.match(/^data:(image\/\w+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
  return new Blob([bytes], { type: mimeType });
}

function getCheckpointName(endpoint: string): string {
  switch (endpoint) {
    case "workflow-wan":
      return "wan2.1.safetensors";
    case "workflow-hunyuan":
      return "hunyuan1.5.safetensors";
    case "workflow-ltx-2.5":
      return "ltx-2.5-19b.safetensors";
    case "workflow-ltx-video":
      return "ltx-video-2b-v0.9.5.safetensors";
    case "workflow-ltx-2.3":
      return "ltx-2.3-19b.safetensors";
    case "workflow-ltx-2":
      return "ltx-2-19b.safetensors";
    default:
      return "ltx-video-2b-v0.9.5.safetensors";
  }
}

function buildGenericWanWorkflow(
  uploadedFilename: string,
  seed: number,
  cfgScale: number,
  prompt: string,
  negativePrompt: string,
  ckptName: string,
  _durationSeconds: number
) {
  // Generic workflow similar to original but with duration awareness
  const fps = 24;

  return {
    "3": {
      "inputs": {
        "seed": seed,
        "steps": 30,
        "cfg": cfgScale,
        "sampler_name": "euler",
        "scheduler": "normal",
        "denoise": 1.0,
        "model": ["4", 0],
        "positive": ["6", 0],
        "negative": ["7", 0],
        "latent_image": ["8", 0]
      },
      "class_type": "KSampler",
      "_meta": { "title": "KSampler" }
    },
    "4": {
      "inputs": { "ckpt_name": ckptName },
      "class_type": "CheckpointLoaderSimple",
      "_meta": { "title": "Load Checkpoint" }
    },
    "6": {
      "inputs": { "text": prompt, "clip": ["4", 1] },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "CLIP Text Encode (Prompt)" }
    },
    "7": {
      "inputs": { "text": negativePrompt || "", "clip": ["4", 1] },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "CLIP Text Encode (Negative)" }
    },
    "8": {
      "inputs": { "image": ["10", 0] },
      "class_type": "VAEEncode",
      "_meta": { "title": "VAE Encode" }
    },
    "10": {
      "inputs": { "image": uploadedFilename },
      "class_type": "LoadImage",
      "_meta": { "title": "Load Image" }
    },
    "11": {
      "inputs": { "samples": ["3", 0], "vae": ["4", 2] },
      "class_type": "VAEDecode",
      "_meta": { "title": "VAE Decode" }
    },
    "12": {
      "inputs": {
        "frame_rate": fps,
        "loop_count": 0,
        "filename_prefix": "KINESIS",
        "format": "video/h264-mp4",
        "pix_fmt": "yuv420p",
        "crf": 19,
        "save_metadata": true,
        "pingpong": false,
        "images": ["11", 0]
      },
      "class_type": "VideoCombine",
      "_meta": { "title": "Video Combine" }
    }
  };
}

function buildLTXVideoWorkflow(
  uploadedFilename: string,
  _seed: number,
  prompt: string,
  negativePrompt: string,
  ckptName: string,
  durationSeconds: number,
  aspectRatio: string
) {
  // Based on comfyanonymous LTXV simple workflow
  // width/height mapping
  let width = 768;
  let height = 512;
  if (aspectRatio === "9:16") {
    width = 512;
    height = 768;
  } else if (aspectRatio === "1:1") {
    width = 768;
    height = 768;
  } else {
    width = 768;
    height = 512;
  }

  // Length = frames: 25 fps * duration, but LTXV uses 8n+1 formula
  const fps = 24;
  let frames = Math.round(durationSeconds * fps);
  // Ensure frames % 8 == 1 for LTXV
  frames = Math.floor(frames / 8) * 8 + 1;
  frames = Math.max(9, Math.min(257, frames));

  return {
    "38": {
      "inputs": {
        "clip_name": "t5xxl_fp16.safetensors",
        "type": "ltxv",
        "device": "default"
      },
      "class_type": "CLIPLoader",
      "_meta": { "title": "CLIPLoader LTXV" }
    },
    "44": {
      "inputs": { "ckpt_name": ckptName },
      "class_type": "CheckpointLoaderSimple",
      "_meta": { "title": "Load LTX Checkpoint" }
    },
    "78": {
      "inputs": { "image": uploadedFilename },
      "class_type": "LoadImage",
      "_meta": { "title": "Load Image" }
    },
    "82": {
      "inputs": { "image": ["78", 0] },
      "class_type": "LTXVPreprocess",
      "_meta": { "title": "LTXV Preprocess" }
    },
    "6": {
      "inputs": { "text": prompt, "clip": ["38", 0] },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "Positive Prompt" }
    },
    "7": {
      "inputs": { "text": negativePrompt || "low quality, worst quality, deformed, distorted", "clip": ["38", 0] },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "Negative Prompt" }
    },
    "95": {
      "inputs": {
        "positive": ["6", 0],
        "negative": ["7", 0],
        "vae": ["44", 2],
        "image": ["82", 0],
        "width": width,
        "height": height,
        "length": frames,
        "batch_size": 1
      },
      "class_type": "LTXVImgToVideo",
      "_meta": { "title": "LTXV Img To Video" }
    },
    "69": {
      "inputs": {
        "positive": ["95", 0],
        "negative": ["95", 1],
        "frame_rate": fps
      },
      "class_type": "LTXVConditioning",
      "_meta": { "title": "LTXV Conditioning" }
    },
    "73": {
      "inputs": { "sampler_name": "euler" },
      "class_type": "KSamplerSelect",
      "_meta": { "title": "Sampler Select" }
    },
    "71": {
      "inputs": {
        "latent": ["95", 2],
        "steps": 30,
        "detail_level": 2.05,
        "threshold": 0.95,
        "cfg": 1.0,
        "skip": 0.1
      },
      "class_type": "LTXVScheduler",
      "_meta": { "title": "LTXV Scheduler" }
    },
    "72": {
      "inputs": {
        "model": ["44", 0],
        "positive": ["69", 0],
        "negative": ["69", 1],
        "sampler": ["73", 0],
        "sigmas": ["71", 0],
        "latent_image": ["95", 2]
      },
      "class_type": "SamplerCustom",
      "_meta": { "title": "Sampler Custom" }
    },
    "8": {
      "inputs": {
        "samples": ["72", 0],
        "vae": ["44", 2]
      },
      "class_type": "VAEDecode",
      "_meta": { "title": "VAE Decode" }
    },
    "12": {
      "inputs": {
        "frame_rate": fps,
        "loop_count": 0,
        "filename_prefix": "KINESIS_LTX",
        "format": "video/h264-mp4",
        "pix_fmt": "yuv420p",
        "crf": 19,
        "save_metadata": true,
        "images": ["8", 0]
      },
      "class_type": "VideoCombine",
      "_meta": { "title": "Video Combine" }
    }
  };
}

function buildLTX25Workflow(
  uploadedFilename: string,
  _seed: number,
  prompt: string,
  negativePrompt: string,
  ckptName: string,
  durationSeconds: number,
  aspectRatio: string
) {
  // LTX-2.5 uses similar structure but with LTX-2.5 specific nodes
  // For ComfyUI core LTX-2 support, we try to use LTX2ModelLoader and LTXConditioning if available
  // Fallback to LTXV workflow with different checkpoint

  let width = 1280;
  let height = 720;
  if (aspectRatio === "9:16") {
    width = 720;
    height = 1280;
  } else if (aspectRatio === "1:1") {
    width = 1024;
    height = 1024;
  }

  const fps = 24;
  let frames = Math.round(durationSeconds * fps);
  frames = Math.floor(frames / 8) * 8 + 1;
  frames = Math.max(9, Math.min(257, frames));

  // Try to use LTX-2.5 workflow with core nodes
  // This is a best-effort workflow that works with ComfyUI core LTX-2.5 support
  return {
    "1": {
      "inputs": { "image": uploadedFilename },
      "class_type": "LoadImage",
      "_meta": { "title": "Load Image" }
    },
    "2": {
      "inputs": { "ckpt_name": ckptName },
      "class_type": "CheckpointLoaderSimple",
      "_meta": { "title": "Load LTX-2.5 Checkpoint" }
    },
    "3": {
      "inputs": {
        "clip_name": "t5xxl_fp16.safetensors",
        "type": "ltxv",
        "device": "default"
      },
      "class_type": "CLIPLoader",
      "_meta": { "title": "CLIPLoader" }
    },
    "4": {
      "inputs": { "text": prompt, "clip": ["3", 0] },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "Positive" }
    },
    "5": {
      "inputs": { "text": negativePrompt || "", "clip": ["3", 0] },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "Negative" }
    },
    "6": {
      "inputs": {
        "positive": ["4", 0],
        "negative": ["5", 0],
        "vae": ["2", 2],
        "image": ["1", 0],
        "width": width,
        "height": height,
        "length": frames,
        "batch_size": 1,
        "generate_audio": true,
        "is_portrait": aspectRatio === "9:16"
      },
      "class_type": "LTXVImgToVideo",
      "_meta": { "title": "LTX-2.5 ImgToVideo" }
    },
    "7": {
      "inputs": {
        "positive": ["6", 0],
        "negative": ["6", 1],
        "frame_rate": fps
      },
      "class_type": "LTXVConditioning",
      "_meta": { "title": "LTXV Conditioning" }
    },
    "8": {
      "inputs": { "sampler_name": "euler" },
      "class_type": "KSamplerSelect",
      "_meta": { "title": "Sampler" }
    },
    "9": {
      "inputs": {
        "latent": ["6", 2],
        "steps": 30,
        "detail_level": 2.5,
        "threshold": 0.9
      },
      "class_type": "LTXVScheduler",
      "_meta": { "title": "LTXV Scheduler" }
    },
    "10": {
      "inputs": {
        "model": ["2", 0],
        "positive": ["7", 0],
        "negative": ["7", 1],
        "sampler": ["8", 0],
        "sigmas": ["9", 0],
        "latent_image": ["6", 2]
      },
      "class_type": "SamplerCustom",
      "_meta": { "title": "SamplerCustom" }
    },
    "11": {
      "inputs": {
        "samples": ["10", 0],
        "vae": ["2", 2]
      },
      "class_type": "VAEDecode",
      "_meta": { "title": "VAEDecode" }
    },
    "12": {
      "inputs": {
        "frame_rate": fps,
        "loop_count": 0,
        "filename_prefix": "KINESIS_LTX25",
        "format": "video/h264-mp4",
        "pix_fmt": "yuv420p",
        "crf": 18,
        "save_metadata": true,
        "images": ["11", 0]
      },
      "class_type": "VideoCombine",
      "_meta": { "title": "VideoCombine" }
    }
  };
}

export async function submitComfyUIJob(params: GenerationParams, serverUrl: string): Promise<{ promptId: string }> {
  const normalizedUrl = serverUrl.replace(/\/$/, "");
  let uploadedFilename = "uploaded_frame.png";
  let originalFilename = uploadedFilename;

  if (params.imageUrl.startsWith("data:image")) {
    const blob = dataUrlToBlob(params.imageUrl);
    const formData = new FormData();
    formData.append("image", blob, uploadedFilename);
    formData.append("overwrite", "true");

    const uploadRes = await apiFetch(`${normalizedUrl}/upload/image`, {
      method: "POST",
      body: formData
    });
    if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        throw new Error(`ComfyUI Base64 frame upload failed: ${errorText}`);
    }

    const uploadData = await uploadRes.json();
    uploadedFilename = uploadData.name || uploadedFilename;
    originalFilename = uploadedFilename;
  } else if (params.imageUrl.startsWith("http://") || params.imageUrl.startsWith("https://")) {
    // For remote URLs, we need to download and re-upload to ComfyUI
    // Try to fetch via media proxy first, then upload
    try {
      const imageRes = await fetch(params.imageUrl);
      if (imageRes.ok) {
        const blob = await imageRes.blob();
        const formData = new FormData();
        const ext = blob.type.split("/")[1] || "png";
        const filename = `remote_${Date.now()}.${ext}`;
        formData.append("image", blob, filename);
        formData.append("overwrite", "true");

        const uploadRes = await apiFetch(`${normalizedUrl}/upload/image`, {
          method: "POST",
          body: formData
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedFilename = uploadData.name || filename;
        } else {
          // If upload fails, use original URL as filename reference (ComfyUI may support URL?)
          uploadedFilename = originalFilename;
        }
      }
    } catch (e) {
      console.warn("Failed to re-upload remote image to ComfyUI, using original filename", e);
      uploadedFilename = originalFilename;
    }
  }

  const seed = params.seed !== null ? params.seed : Math.floor(Math.random() * 1000000000);
  const ckptName = getCheckpointName(params.model.endpoint);

  let workflow: any;

  switch (params.model.endpoint) {
    case "workflow-ltx-2.5":
    case "workflow-ltx-2.3":
    case "workflow-ltx-2":
      workflow = buildLTX25Workflow(
        uploadedFilename,
        seed,
        params.prompt,
        params.negativePrompt,
        ckptName,
        params.durationSeconds,
        params.aspectRatio
      );
      break;
    case "workflow-ltx-video":
      workflow = buildLTXVideoWorkflow(
        uploadedFilename,
        seed,
        params.prompt,
        params.negativePrompt,
        ckptName,
        params.durationSeconds,
        params.aspectRatio
      );
      break;
    case "workflow-wan":
    case "workflow-hunyuan":
    default:
      workflow = buildGenericWanWorkflow(
        uploadedFilename,
        seed,
        params.cfgScale,
        params.prompt,
        params.negativePrompt,
        ckptName,
        params.durationSeconds
      );
      break;
  }

  const promptPayload = {
    prompt: workflow,
    client_id: "kinesis-local-" + Date.now()
  };

  const submitRes = await apiFetch(`${normalizedUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(promptPayload)
  });

  if (!submitRes.ok) {
      const errorText = await submitRes.text();
      throw new Error(`ComfyUI prompt submission rejected: ${errorText}`);
  }

  const submitData = await submitRes.json();

  if (!submitData.prompt_id) {
    throw new Error("ComfyUI did not return a valid prompt_id.");
  }

  return { promptId: submitData.prompt_id };
}

export async function pollComfyUIJob(promptId: string, serverUrl: string, onProgress?: (msg: string) => void): Promise<string> {
  const normalizedUrl = serverUrl.replace(/\/$/, "");
  let attempt = 0;
  const maxAttempts = 300;

  while (attempt < maxAttempts) {
    attempt++;
    await sleep(3000);
    
    if (onProgress) {
        onProgress(`Polling local ComfyUI (${attempt}/${maxAttempts}) - ${promptId.slice(0, 8)}...`);
    }

    let historyRes: Response;
    try {
      historyRes = await fetch(`${normalizedUrl}/history/${promptId}`);
    } catch (e: any) {
      if (onProgress) onProgress(`ComfyUI not reachable, retrying... ${e.message}`);
      continue;
    }
    
    if (historyRes.status === 404 || historyRes.status === 400) {
        continue;
    }

    if (!historyRes.ok) {
      throw new Error(`ComfyUI history endpoint failed: ${historyRes.status} ${historyRes.statusText}`);
    }

    let historyData: any;
    try {
      historyData = await historyRes.json();
    } catch {
      continue;
    }
    
    if (historyData[promptId]) {
      const job = historyData[promptId];
      
      // Check if job failed
      if (job.status && job.status.status_str === "error") {
        const messages = job.status.messages || [];
        throw new Error(`ComfyUI job failed: ${JSON.stringify(messages).slice(0, 500)}`);
      }

      if (job.status && job.status.completed) {
        const outputs = job.outputs;
        for (const nodeId in outputs) {
          const nodeOutput = outputs[nodeId];
          // Check for various output types
          if (nodeOutput.gifs && nodeOutput.gifs.length > 0) {
            const file = nodeOutput.gifs[0];
            return `${normalizedUrl}/view?filename=${file.filename}&subfolder=${file.subfolder}&type=${file.type}`;
          }
          if (nodeOutput.videos && nodeOutput.videos.length > 0) {
            const file = nodeOutput.videos[0];
            return `${normalizedUrl}/view?filename=${file.filename}&subfolder=${file.subfolder}&type=${file.type}`;
          }
          if (nodeOutput.images && nodeOutput.images.length > 0) {
            // For VideoCombine, it might output as images that are actually video frames combined?
            // Check if filename ends with mp4
            const file = nodeOutput.images.find((f: any) => f.filename.endsWith(".mp4") || f.filename.endsWith(".webm")) || nodeOutput.images[0];
            return `${normalizedUrl}/view?filename=${file.filename}&subfolder=${file.subfolder}&type=${file.type}`;
          }
        }
        throw new Error("Job completed in ComfyUI but no video output was located in the graph. Check ComfyUI logs and ensure VideoCombine/SaveVideo node exists.");
      }
    }
  }
  throw new Error("ComfyUI generation timed out after max attempts (15 min). Check ComfyUI server logs.");
}
