import type { Provider } from "../types";
import { apiFetch, dataUrlToBase64 } from "./helpers";

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

async function uploadToFal(
  dataUrl: string,
  apiKey: string
): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const ext = blob.type.split("/")[1] || "png";
  const filename = `input_${Date.now()}.${ext}`;
  const targetPath = `uploads/${filename}`;

  const formData = new FormData();
  formData.append("file_upload", blob, filename);

  const res = await apiFetch(
    `https://api.fal.ai/v1/serverless/files/file/local/${encodeURIComponent(targetPath)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Key ${apiKey}`,
      },
      body: formData,
    },
    { maxRetries: 1, timeoutMs: 60_000 }
  );
  let json: { url?: string; file_url?: string };
  try {
    json = await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    throw new Error(`fal upload failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  const uploadedUrl = json?.url || json?.file_url;
  if (uploadedUrl) return uploadedUrl;

  return `https://v3.fal.media/files/${targetPath}`;
}

async function uploadToReplicate(
  dataUrl: string,
  apiKey: string
): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const formData = new FormData();
  formData.append("content", blob, "input.png");

  const res = await apiFetch(
    "https://api.replicate.com/v1/files",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    },
    { maxRetries: 1, timeoutMs: 60_000 }
  );
  const json = await res.json();
  if (json?.urls?.get) return json.urls.get;
  throw new Error("Replicate file upload did not return a URL.");
}

export async function ensureImageUrl(
  imageUrl: string,
  provider: Provider,
  apiKeys: { fal: string; replicate: string; runway: string; luma: string; comfyui: string }
): Promise<string> {
  if (imageUrl.startsWith("https://") || imageUrl.startsWith("http://")) {
    return imageUrl;
  }

  switch (provider) {
    case "comfyui": {
      return imageUrl;
    }
    case "fal": {
      if (apiKeys.fal) {
        try {
          return await uploadToFal(imageUrl, apiKeys.fal);
        } catch (e) {
          console.warn("fal image upload failed, trying Replicate fallback.", e);
        }
      }
      if (apiKeys.replicate) {
        try {
          return await uploadToReplicate(imageUrl, apiKeys.replicate);
        } catch (e) {
          console.warn("Replicate fallback upload also failed.", e);
        }
      }
      return imageUrl;
    }
    case "replicate": {
      if (apiKeys.replicate) {
        try {
          return await uploadToReplicate(imageUrl, apiKeys.replicate);
        } catch (e) {
          console.warn("Replicate image upload failed.", e);
        }
      }
      return imageUrl;
    }
    case "runway": {
      return imageUrl;
    }
    case "luma": {
      if (apiKeys.fal) {
        try {
          return await uploadToFal(imageUrl, apiKeys.fal);
        } catch (e) {
          console.warn("fal upload for Luma failed.", e);
        }
      }
      console.warn(
        "Luma requires a hosted image URL. Upload failed. Generation will likely fail."
      );
      return imageUrl;
    }
    default:
      return imageUrl;
  }
}
