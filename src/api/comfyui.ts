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

export async function submitComfyUIJob(params: GenerationParams, serverUrl: string): Promise<{ promptId: string }> {
  const normalizedUrl = serverUrl.replace(/\/$/, "");
  let uploadedFilename = "uploaded_frame.png";

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
  }

  const seed = params.seed !== null ? params.seed : Math.floor(Math.random() * 1000000000);
  const ckptName = params.model.endpoint === "workflow-wan" ? "wan2.1.safetensors" : "hunyuan1.5.safetensors";
  const workflow = {
    "3": {
      "inputs": {
        "seed": seed,
        "steps": 30,
        "cfg": params.cfgScale,
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
      "inputs": { "text": params.prompt, "clip": ["4", 1] },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "CLIP Text Encode (Prompt)" }
    },
    "7": {
      "inputs": { "text": params.negativePrompt || "", "clip": ["4", 1] },
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
        "frame_rate": 24,
        "loop_count": 0,
        "filename_prefix": "KINESIS",
        "format": "video/h264-mp4",
        "pix_fmt": "yuv420p",
        "crf": 19,
        "save_metadata": true,
        "pingpong": false,
        "file": "Output.mp4",
        "images": ["11", 0]
      },
      "class_type": "VideoCombine",
      "_meta": { "title": "Video Combine" }
    }
  };
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
        onProgress(`Polling local ComfyUI (attempt ${attempt})...`);
    }

    const historyRes = await fetch(`${normalizedUrl}/history/${promptId}`);
    
    if (historyRes.status === 404 || historyRes.status === 400) {
        continue;
    }

    if (!historyRes.ok) {
      throw new Error(`ComfyUI history endpoint failed: ${historyRes.statusText}`);
    }

    const historyData = await historyRes.json();
    
    if (historyData[promptId]) {
      const job = historyData[promptId];
      if (job.status && job.status.completed) {
        const outputs = job.outputs;
        for (const nodeId in outputs) {
          const nodeOutput = outputs[nodeId];
          if (nodeOutput.gifs && nodeOutput.gifs.length > 0) {
            const file = nodeOutput.gifs[0];
            return `${normalizedUrl}/view?filename=${file.filename}&subfolder=${file.subfolder}&type=${file.type}`;
          }
          if (nodeOutput.images && nodeOutput.images.length > 0) {
            const file = nodeOutput.images[0];
            return `${normalizedUrl}/view?filename=${file.filename}&subfolder=${file.subfolder}&type=${file.type}`;
          }
        }
        throw new Error("Job completed in ComfyUI but no video output was located in the graph schema.");
      }
    }
  }
  throw new Error("ComfyUI generation timed out after max attempts.");
}
