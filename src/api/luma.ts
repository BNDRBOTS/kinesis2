import type { GenerationParams } from "../types";
import { apiFetch, sleep } from "./helpers";
import {
  POLL_INTERVAL_BASE_MS,
  POLL_INTERVAL_MAX_MS,
  POLL_MAX_ATTEMPTS,
} from "../constants";

interface LumaGeneration {
  id: string;
  state: "queued" | "dreaming" | "completed" | "failed";
  failure_reason?: string;
  assets?: {
    video?: string;
  };
  video?: string | { url?: string };
}

const LUMA_PROXY = "/api/luma";
const LUMA_API_BASE = "https://api.lumalabs.ai/dream-machine/v1";

function mapAspectRatioToLuma(aspectRatio: string): string {
  switch (aspectRatio) {
    case "16:9":
    case "1280:720":
      return "16:9";
    case "9:16":
    case "720:1280":
      return "9:16";
    case "1:1":
    case "960:960":
      return "1:1";
    default:
      return aspectRatio.includes(":") ? aspectRatio : "16:9";
  }
}

async function lumaFetchWithProxy(
  targetPath: string,
  apiKey: string,
  init: RequestInit,
  useProxy: boolean = true
): Promise<Response> {
  if (useProxy) {
    try {
      const proxyUrl = `${LUMA_PROXY}?targetPath=${encodeURIComponent(targetPath)}`;
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      };

      if (init.method === "POST") {
        const body = init.body as string;
        let parsed: any = {};
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = {};
        }
        const res = await apiFetch(proxyUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ targetPath, ...parsed }),
        });
        return res;
      } else {
        const res = await apiFetch(proxyUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
        });
        return res;
      }
    } catch (e) {
      console.warn("Luma proxy failed, falling back to direct:", e);
    }
  }

  // Direct
  const url = `${LUMA_API_BASE}${targetPath.startsWith("/") ? targetPath : "/" + targetPath}`;
  // If targetPath already full URL? handle
  const finalUrl = targetPath.startsWith("https://") ? targetPath : url;
  return apiFetch(finalUrl, init);
}

export async function submitLumaJob(
  params: GenerationParams,
  apiKey: string
): Promise<{ generationId: string }> {
  const targetPath = "/dream-machine/v1/generations";

  // Map model endpoint: ray-2, ray-flash-2, ray-flash-2-720p, etc
  let modelId = params.model.endpoint;
  // Normalize some legacy names
  if (modelId === "ray-2") modelId = "ray-2";
  if (modelId === "ray-flash-2") modelId = "ray-flash-2";
  // ray-flash-2-720p is a valid model id for API? Actually API uses ray-2 and ray-flash-2 with resolution param
  // But we support passing model as-is, and set resolution separately

  const body: Record<string, unknown> = {
    prompt: params.prompt,
    model: modelId.includes("ray") ? modelId : "ray-2",
    aspect_ratio: mapAspectRatioToLuma(params.aspectRatio || "16:9"),
    keyframes: {
      frame0: {
        type: "image",
        url: params.imageUrl,
      },
    },
  };

  // Handle resolution and duration for newer models
  // Luma API supports duration as "5s" or 5, and resolution as "540p", "720p", "1080p", "4k"
  if (params.durationSeconds) {
    // Luma expects duration like "5s" or 5, we send as number for 5 or 9
    (body as any).duration = `${params.durationSeconds}s`;
  }

  // Resolution mapping - default 720p, but allow 1080p for ray-2
  if (modelId.includes("720p")) {
    (body as any).resolution = "720p";
    // Strip resolution from model id if needed, Luma API expects model = ray-flash-2 etc with resolution param
    // But we keep model as ray-flash-2-720p if that's what user selected? Actually API model should be ray-2 or ray-flash-2
    // So we normalize
    if (modelId === "ray-flash-2-720p") {
      (body as any).model = "ray-flash-2";
      (body as any).resolution = "720p";
    }
  } else if (modelId.includes("540p")) {
    (body as any).resolution = "540p";
    if (modelId === "ray-flash-2-540p") {
      (body as any).model = "ray-flash-2";
    }
  } else {
    (body as any).resolution = "720p";
  }

  // If model is ray-2, we can request 1080p for better quality
  if (modelId === "ray-2") {
    (body as any).resolution = "1080p";
  }

  let res: Response;
  try {
    res = await lumaFetchWithProxy(targetPath, apiKey, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, true);
  } catch {
    res = await lumaFetchWithProxy(targetPath, apiKey, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, false);
  }

  let json: LumaGeneration;
  try {
    json = await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Luma returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 400)}`
    );
  }

  if (!json.id) {
    throw new Error(
      `Luma did not return a generation ID: ${JSON.stringify(json).slice(0, 500)}`
    );
  }

  return { generationId: json.id };
}

export async function pollLumaJob(
  generationId: string,
  apiKey: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const targetPath = `/dream-machine/v1/generations/${generationId}`;
  let interval = POLL_INTERVAL_BASE_MS;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(interval);

    let res: Response;
    try {
      res = await lumaFetchWithProxy(targetPath, apiKey, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      }, true);
    } catch {
      res = await lumaFetchWithProxy(targetPath, apiKey, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      }, false);
    }

    let gen: LumaGeneration;
    try {
      gen = await res.json();
    } catch {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Luma returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 400)}`
      );
    }

    if (onProgress) {
      onProgress(`Luma generation ${gen.id}: ${gen.state}`);
    }

    if (gen.state === "completed") {
      let videoUrl: string | undefined;
      if (gen.assets?.video) {
        videoUrl = gen.assets.video;
      } else if (typeof gen.video === "string") {
        videoUrl = gen.video;
      } else if (gen.video && typeof gen.video === "object" && gen.video.url) {
        videoUrl = gen.video.url;
      }

      if (!videoUrl) {
        throw new Error(
          "Luma generation completed but no video URL in response."
        );
      }
      return videoUrl;
    }

    if (gen.state === "failed") {
      throw new Error(
        `Luma generation failed: ${gen.failure_reason || "unknown error"}`
      );
    }

    interval = Math.min(interval * 1.3, POLL_INTERVAL_MAX_MS);
  }

  throw new Error(
    `Luma generation did not complete within ${POLL_MAX_ATTEMPTS} poll attempts.`
  );
}
