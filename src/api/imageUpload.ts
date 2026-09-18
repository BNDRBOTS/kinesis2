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

const FAL_FILE_PROXY = "/api/fal-file";
const REPLICATE_PROXY = "/api/replicate";

async function uploadToFal(
  dataUrl: string,
  apiKey: string
): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const ext = blob.type.split("/")[1] || "png";
  const filename = `input_${Date.now()}.${ext}`;
  const targetPath = `uploads/${filename}`;

  // Try proxy first for CORS
  const formData = new FormData();
  formData.append("file_upload", blob, filename);

  // First attempt via fal-file proxy
  try {
    const proxyUrl = `${FAL_FILE_PROXY}?targetPath=${encodeURIComponent(`/v1/serverless/files/file/local/${encodeURIComponent(targetPath)}`)}`;
    const res = await apiFetch(
      proxyUrl,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
        },
        body: formData,
      },
      { maxRetries: 1, timeoutMs: 60_000 }
    );
    let json: { url?: string; file_url?: string; fileUrl?: string };
    try {
      json = await res.json();
    } catch {
      const text = await res.text().catch(() => "");
      throw new Error(`fal proxy upload failed (HTTP ${res.status}): ${text.slice(0, 400)}`);
    }

    const uploadedUrl = (json as any)?.url || (json as any)?.file_url || (json as any)?.fileUrl || (json as any)?.file?.url;
    if (uploadedUrl) return uploadedUrl;
  } catch (e) {
    console.warn("fal proxy upload failed, trying direct:", e);
  }

  // Fallback direct upload
  try {
    const formDataDirect = new FormData();
    formDataDirect.append("file_upload", blob, filename);

    const res = await apiFetch(
      `https://api.fal.ai/v1/serverless/files/file/local/${encodeURIComponent(targetPath)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${apiKey}`,
        },
        body: formDataDirect,
      },
      { maxRetries: 1, timeoutMs: 60_000 }
    );
    let json: { url?: string; file_url?: string };
    try {
      json = await res.json();
    } catch {
      const text = await res.text().catch(() => "");
      throw new Error(`fal upload failed (HTTP ${res.status}): ${text.slice(0, 400)}`);
    }

    const uploadedUrl = json?.url || json?.file_url;
    if (uploadedUrl) return uploadedUrl;

    return `https://v3.fal.media/files/${targetPath}`;
  } catch (e) {
    console.warn("fal direct upload also failed:", e);
    throw e;
  }
}

async function uploadToReplicate(
  dataUrl: string,
  apiKey: string
): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);

  // Try via proxy first - proxy needs to handle FormData
  // For now, try direct with fallback
  const tryUpload = async (useProxy: boolean): Promise<string> => {
    const formData = new FormData();
    formData.append("content", blob, "input.png");

    const url = useProxy
      ? `${REPLICATE_PROXY}?targetPath=${encodeURIComponent("/v1/files")}`
      : "https://api.replicate.com/v1/files";

    // For proxy, we need to handle FormData differently - our current proxy expects JSON
    // So we attempt direct but with proper headers, and if that fails due to CORS, we try fal as fallback
    const res = await apiFetch(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          // Don't set Content-Type for FormData
        },
        body: formData,
      },
      { maxRetries: 1, timeoutMs: 60_000 }
    );
    const json: any = await res.json();
    if (json?.urls?.get) return json.urls.get;
    if (json?.url) return json.url;
    throw new Error("Replicate file upload did not return a URL.");
  };

  try {
    return await tryUpload(false);
  } catch (e) {
    console.warn("Replicate direct upload failed, trying proxy:", e);
    try {
      return await tryUpload(true);
    } catch (e2) {
      console.warn("Replicate proxy upload also failed:", e2);
      throw e2;
    }
  }
}

// For Runway and Luma, we need hosted URLs - use fal as hosting if available
async function uploadToFalForOtherProvider(
  dataUrl: string,
  falApiKey: string
): Promise<string> {
  return uploadToFal(dataUrl, falApiKey);
}

export async function ensureImageUrl(
  imageUrl: string,
  provider: Provider,
  apiKeys: { fal: string; replicate: string; runway: string; luma: string; comfyui: string }
): Promise<string> {
  // If already https, return as is, but optionally proxy through media for CORS?
  // For image URLs that are https, we keep them - they will be proxied at video stage if needed
  if (imageUrl.startsWith("https://") || imageUrl.startsWith("http://")) {
    return imageUrl;
  }

  // For data URLs, need to upload to a host for providers that require public URL
  switch (provider) {
    case "comfyui": {
      // ComfyUI can handle data URLs directly via upload/image endpoint
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
      // If upload fails, return data URL - some fal endpoints support base64 data URI
      console.warn("All uploads failed, returning data URL - fal may support base64");
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
      if (apiKeys.fal) {
        try {
          return await uploadToFal(imageUrl, apiKeys.fal);
        } catch (e) {
          console.warn("fal fallback for replicate failed.", e);
        }
      }
      return imageUrl;
    }
    case "runway": {
      // Runway requires public URL, try fal hosting
      if (apiKeys.fal) {
        try {
          return await uploadToFalForOtherProvider(imageUrl, apiKeys.fal);
        } catch (e) {
          console.warn("fal upload for Runway failed.", e);
        }
      }
      if (apiKeys.replicate) {
        try {
          return await uploadToReplicate(imageUrl, apiKeys.replicate);
        } catch (e) {
          console.warn("Replicate upload for Runway failed.", e);
        }
      }
      console.warn("Runway requires a hosted image URL. Upload failed, returning data URL - will likely fail.");
      return imageUrl;
    }
    case "luma": {
      if (apiKeys.fal) {
        try {
          return await uploadToFalForOtherProvider(imageUrl, apiKeys.fal);
        } catch (e) {
          console.warn("fal upload for Luma failed.", e);
        }
      }
      if (apiKeys.replicate) {
        try {
          return await uploadToReplicate(imageUrl, apiKeys.replicate);
        } catch (e) {
          console.warn("Replicate upload for Luma failed.", e);
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
