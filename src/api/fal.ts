import type { GenerationParams } from "../types";
import { apiFetch, sleep } from "./helpers";
import {
  POLL_INTERVAL_BASE_MS,
  POLL_INTERVAL_MAX_MS,
  POLL_MAX_ATTEMPTS,
} from "../constants";

interface FalQueueResponse {
  request_id: string;
  status: string;
  response_url?: string;
  status_url?: string;
}

interface FalStatusResponse {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  response_url?: string;
  logs?: Array<{ message: string }>;
}

interface FalResultResponse {
  video?: {
    url: string;
    content_type?: string;
    file_size?: number;
  };
  audio?: {
    url: string;
    content_type?: string;
  };
  audio_file?: {
    url: string;
  };
  audios?: Array<{ url: string }>;
  audios_list?: any;
}

const FAL_PROXY = "/api/fal";
const FAL_QUEUE_BASE = "https://queue.fal.run";

function extractTargetPath(fullUrl: string): { base: string; path: string } {
  try {
    const u = new URL(fullUrl);
    if (u.hostname.includes("queue.fal.run") || u.hostname.includes("fal.run")) {
      return { base: "queue", path: u.pathname + u.search };
    }
    if (u.hostname.includes("api.fal.ai")) {
      return { base: "api", path: u.pathname + u.search };
    }
    // fallback
    return { base: "queue", path: u.pathname + u.search };
  } catch {
    // If not a valid URL, assume it's already a path
    return { base: "queue", path: fullUrl.startsWith("/") ? fullUrl : "/" + fullUrl };
  }
}

async function falFetchWithProxy(
  targetUrl: string,
  apiKey: string,
  init: Omit<RequestInit, "headers"> & { headers?: Record<string, string> },
  useProxy: boolean = true
): Promise<Response> {
  const { base, path } = extractTargetPath(targetUrl);

  if (useProxy) {
    try {
      const proxyUrl = `${FAL_PROXY}?targetPath=${encodeURIComponent(path)}&base=${base}`;
      const headers: Record<string, string> = {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      };

      if (init.method === "GET") {
        const res = await apiFetch(proxyUrl, {
          method: "GET",
          headers: {
            Authorization: `Key ${apiKey}`,
          },
        });
        return res;
      } else {
        // POST - body is JSON
        let inputBody: any = {};
        if (init.body) {
          try {
            inputBody = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
          } catch {
            inputBody = {};
          }
        }
        const res = await apiFetch(proxyUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ targetPath: path, ...inputBody }),
        });
        return res;
      }
    } catch (e) {
      console.warn("fal proxy failed, falling back to direct:", e);
      // fall through to direct
    }
  }

  // Direct fetch
  const directHeaders: Record<string, string> = {
    Authorization: `Key ${apiKey}`,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };

  return apiFetch(targetUrl, {
    method: init.method || "POST",
    headers: directHeaders,
    body: init.body as any,
  });
}

function buildFalInput(params: GenerationParams): Record<string, unknown> {
  const endpointId = params.model.endpoint;
  const input: Record<string, unknown> = {
    prompt: params.prompt,
  };

  // Handle LTX family - they use image_url + prompt + duration + resolution
  if (endpointId.includes("ltx")) {
    input.image_url = params.imageUrl;
    // Duration handling - LTX expects number or string, we send number
    if (params.durationSeconds) {
      // For LTX-2.5 fast, max 20s, for others 6-10s
      input.duration = params.durationSeconds;
    }
    // Resolution handling
    if (endpointId.includes("ltx-2.5")) {
      input.resolution = "1080p";
      // LTX-2.5 also supports aspect_ratio auto, but we can pass if needed
      if (params.aspectRatio) {
        // Map aspect ratio to LTX expected format
        input.aspect_ratio = params.aspectRatio;
      }
      // Generate audio flag for LTX-2.5 (native audio)
      (input as any).generate_audio = true;
    } else if (endpointId.includes("ltx-2")) {
      input.resolution = "1080p";
    }
    // For distilled models, just image_url + prompt is enough

    if (params.negativePrompt && params.model.supportsNegativePrompt) {
      (input as any).negative_prompt = params.negativePrompt;
    }

    return input;
  }

  // Handle Kling family
  if (endpointId.includes("kling-video")) {
    // Determine correct image field
    if (endpointId.includes("/o3/")) {
      // O3 uses image_url per docs
      input.image_url = params.imageUrl;
    } else if (endpointId.includes("/v3/")) {
      // v3 uses start_image_url
      (input as any).start_image_url = params.imageUrl;
    } else if (endpointId.includes("/v2.6/")) {
      (input as any).start_image_url = params.imageUrl;
    } else if (endpointId.includes("/v2/")) {
      // v2 master legacy - try image_url
      input.image_url = params.imageUrl;
    } else {
      // fallback - send both to maximize compatibility
      input.image_url = params.imageUrl;
      (input as any).start_image_url = params.imageUrl;
    }

    // Duration as string for Kling
    input.duration = String(params.durationSeconds);

    if (params.negativePrompt && params.model.supportsNegativePrompt) {
      (input as any).negative_prompt = params.negativePrompt;
    }

    if (params.cfgScale !== undefined) {
      (input as any).cfg_scale = params.cfgScale;
    }

    if (params.aspectRatio) {
      (input as any).aspect_ratio = params.aspectRatio;
    }

    // Enable audio generation for v3 and v2.6
    if (endpointId.includes("/v3/") || endpointId.includes("/v2.6/")) {
      (input as any).generate_audio = false; // Keep false for silent chaining, audio added via foley step
    }

    return input;
  }

  // Generic fallback for other fal models
  input.image_url = params.imageUrl;
  input.duration = String(params.durationSeconds);

  if (params.negativePrompt && params.model.supportsNegativePrompt) {
    (input as any).negative_prompt = params.negativePrompt;
  }

  if (params.cfgScale !== undefined) {
    (input as any).cfg_scale = params.cfgScale;
  }

  if (params.aspectRatio) {
    (input as any).aspect_ratio = params.aspectRatio;
  }

  return input;
}

export async function submitFalJob(
  params: GenerationParams,
  apiKey: string
): Promise<{ requestId: string; statusUrl: string; responseUrl: string }> {
  const endpointId = params.model.endpoint;
  const submitUrl = `${FAL_QUEUE_BASE}/${endpointId}`;

  const input = buildFalInput(params);

  // Try proxy first
  let res: Response;
  try {
    res = await falFetchWithProxy(submitUrl, apiKey, {
      method: "POST",
      body: JSON.stringify(input),
    }, true);
  } catch (e) {
    // If proxy fails, try direct
    res = await falFetchWithProxy(submitUrl, apiKey, {
      method: "POST",
      body: JSON.stringify(input),
    }, false);
  }

  let json: FalQueueResponse;
  try {
    json = await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    throw new Error(
      `fal.ai returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 400)}`
    );
  }

  if (!json.request_id) {
    throw new Error(
      `fal submit did not return a request_id: ${JSON.stringify(json).slice(0, 500)}`
    );
  }

  const statusUrl =
    json.status_url ||
    `${FAL_QUEUE_BASE}/${endpointId}/requests/${json.request_id}/status`;
  const responseUrl =
    json.response_url ||
    `${FAL_QUEUE_BASE}/${endpointId}/requests/${json.request_id}`;

  return {
    requestId: json.request_id,
    statusUrl,
    responseUrl,
  };
}

export async function pollFalJob(
  statusUrl: string,
  responseUrl: string,
  apiKey: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  let interval = POLL_INTERVAL_BASE_MS;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(interval);

    let res: Response;
    try {
      res = await falFetchWithProxy(statusUrl, apiKey, { method: "GET" }, true);
    } catch {
      res = await falFetchWithProxy(statusUrl, apiKey, { method: "GET" }, false);
    }

    let status: FalStatusResponse;
    try {
      status = await res.json();
    } catch {
      const text = await res.text().catch(() => "");
      throw new Error(
        `fal.ai returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 400)}`
      );
    }

    if (status.logs && onProgress) {
      for (const log of status.logs) {
        onProgress(log.message);
      }
    }

    if (status.status === "COMPLETED") {
      let resultRes: Response;
      try {
        resultRes = await falFetchWithProxy(responseUrl, apiKey, { method: "GET" }, true);
      } catch {
        resultRes = await falFetchWithProxy(responseUrl, apiKey, { method: "GET" }, false);
      }

      let result: FalResultResponse;
      try {
        result = await resultRes.json();
      } catch {
        const text = await resultRes.text().catch(() => "");
        throw new Error(
          `fal.ai result returned invalid JSON (HTTP ${resultRes.status}): ${text.slice(0, 400)}`
        );
      }

      if (!result.video?.url) {
        throw new Error(
          `fal job completed but no video URL in response: ${JSON.stringify(result).slice(0, 500)}`
        );
      }

      return result.video.url;
    }

    if (status.status === "FAILED") {
      throw new Error("fal.ai generation failed. Check prompt/image and retry.");
    }

    interval = Math.min(interval * 1.3, POLL_INTERVAL_MAX_MS);
  }

  throw new Error(
    `fal.ai job did not complete within ${POLL_MAX_ATTEMPTS} poll attempts.`
  );
}

// Foley audio with multiple fallback endpoints
export async function generateFalFoleyAudio(
  videoUrl: string,
  prompt: string,
  apiKey: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const endpointsToTry = [
    {
      id: "fal-ai/mmaudio-v2/video-to-audio",
      input: {
        video_url: videoUrl,
        prompt: prompt || "cinematic sound effects, matching on-screen motion exactly",
      },
    },
    {
      id: "fal-ai/kling-video/video-to-audio",
      input: {
        video_url: videoUrl,
        sound_effect_prompt: prompt || "cinematic sound effects matching on-screen motion",
        background_music_prompt: "cinematic ambient",
      },
    },
    {
      id: "fal-ai/foley-sound-effects",
      input: {
        video_url: videoUrl,
        prompt: prompt || "cinematic sound effects, matching on-screen motion exactly",
      },
    },
    {
      id: "sonilo/v1.1/video-to-sound-effects",
      input: {
        video_url: videoUrl,
      },
    },
    {
      id: "mirelo-ai/sfx-v1.5/video-to-audio",
      input: {
        video_url: videoUrl,
        prompt: prompt || "cinematic sound effects",
      },
    },
  ];

  let lastError: Error | null = null;

  for (const endpoint of endpointsToTry) {
    try {
      if (onProgress) onProgress(`Submitting video to ${endpoint.id}...`);

      const submitUrl = `${FAL_QUEUE_BASE}/${endpoint.id}`;

      let res: Response;
      try {
        res = await falFetchWithProxy(submitUrl, apiKey, {
          method: "POST",
          body: JSON.stringify(endpoint.input),
        }, true);
      } catch {
        res = await falFetchWithProxy(submitUrl, apiKey, {
          method: "POST",
          body: JSON.stringify(endpoint.input),
        }, false);
      }

      let json: FalQueueResponse;
      try {
        json = await res.json();
      } catch {
        const text = await res.text().catch(() => "");
        throw new Error(`Foley submission invalid JSON: ${text.slice(0, 200)}`);
      }

      if (!json.request_id) {
        throw new Error(`Foley ${endpoint.id} did not return request_id`);
      }

      const statusUrl = json.status_url || `${FAL_QUEUE_BASE}/${endpoint.id}/requests/${json.request_id}/status`;
      const responseUrl = json.response_url || `${FAL_QUEUE_BASE}/${endpoint.id}/requests/${json.request_id}`;

      let interval = POLL_INTERVAL_BASE_MS;
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        await sleep(interval);
        if (onProgress) onProgress(`Polling ${endpoint.id} (attempt ${attempt + 1})...`);

        let statusRes: Response;
        try {
          statusRes = await falFetchWithProxy(statusUrl, apiKey, { method: "GET" }, true);
        } catch {
          statusRes = await falFetchWithProxy(statusUrl, apiKey, { method: "GET" }, false);
        }

        let status: FalStatusResponse;
        try {
          status = await statusRes.json();
        } catch {
          const t = await statusRes.text().catch(() => "");
          throw new Error(`Foley status invalid JSON: ${t.slice(0, 200)}`);
        }

        if (status.status === "COMPLETED") {
          let resultRes: Response;
          try {
            resultRes = await falFetchWithProxy(responseUrl, apiKey, { method: "GET" }, true);
          } catch {
            resultRes = await falFetchWithProxy(responseUrl, apiKey, { method: "GET" }, false);
          }
          const result: any = await resultRes.json();

          // Try multiple possible audio fields
          const audioUrl = result.audio?.url || result.audio_file?.url || result.audios?.[0]?.url || result.video?.url;
          if (!audioUrl) {
            // For kling video-to-audio, it returns video with audio
            if (result.video?.url) return result.video.url;
            throw new Error("Foley generated but no audio URL");
          }
          return audioUrl;
        }

        if (status.status === "FAILED") {
          throw new Error(`Foley ${endpoint.id} failed`);
        }
        interval = Math.min(interval * 1.3, POLL_INTERVAL_MAX_MS);
      }

      throw new Error(`Timed out for ${endpoint.id}`);
    } catch (err: any) {
      lastError = err;
      console.warn(`Foley endpoint ${endpoint.id} failed:`, err.message);
      if (onProgress) onProgress(`⚠️ ${endpoint.id} failed, trying next...`);
      continue;
    }
  }

  throw lastError || new Error("All foley audio endpoints failed");
}

export async function upscaleFalVideo(
  videoUrl: string,
  apiKey: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const endpointsToTry = [
    {
      id: "fal-ai/topaz/upscale/video",
      input: {
        video_url: videoUrl,
        upscale_factor: 2,
        model: "Proteus",
      },
    },
    {
      id: "fal-ai/video-upscaler",
      input: {
        video_url: videoUrl,
        scale: 2,
      },
    },
  ];

  let lastError: Error | null = null;

  for (const endpoint of endpointsToTry) {
    try {
      if (onProgress) onProgress(`Submitting video to ${endpoint.id}...`);

      const submitUrl = `${FAL_QUEUE_BASE}/${endpoint.id}`;

      let res: Response;
      try {
        res = await falFetchWithProxy(submitUrl, apiKey, {
          method: "POST",
          body: JSON.stringify(endpoint.input),
        }, true);
      } catch {
        res = await falFetchWithProxy(submitUrl, apiKey, {
          method: "POST",
          body: JSON.stringify(endpoint.input),
        }, false);
      }

      let json: FalQueueResponse;
      try {
        json = await res.json();
      } catch {
        const text = await res.text().catch(() => "");
        throw new Error(`Upscaler submission invalid JSON: ${text.slice(0, 200)}`);
      }

      if (!json.request_id) {
        throw new Error(`Upscaler ${endpoint.id} did not return request_id`);
      }

      const statusUrl = json.status_url || `${FAL_QUEUE_BASE}/${endpoint.id}/requests/${json.request_id}/status`;
      const responseUrl = json.response_url || `${FAL_QUEUE_BASE}/${endpoint.id}/requests/${json.request_id}`;

      let interval = POLL_INTERVAL_BASE_MS;
      for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
        await sleep(interval);
        if (onProgress) onProgress(`Polling ${endpoint.id} (attempt ${attempt + 1})...`);

        let statusRes: Response;
        try {
          statusRes = await falFetchWithProxy(statusUrl, apiKey, { method: "GET" }, true);
        } catch {
          statusRes = await falFetchWithProxy(statusUrl, apiKey, { method: "GET" }, false);
        }

        const status: FalStatusResponse = await statusRes.json();

        if (status.status === "COMPLETED") {
          let resultRes: Response;
          try {
            resultRes = await falFetchWithProxy(responseUrl, apiKey, { method: "GET" }, true);
          } catch {
            resultRes = await falFetchWithProxy(responseUrl, apiKey, { method: "GET" }, false);
          }
          const result: FalResultResponse = await resultRes.json();

          if (!result.video?.url) throw new Error("Upscaler returned no video URL");
          return result.video.url;
        }

        if (status.status === "FAILED") {
          throw new Error(`${endpoint.id} failed`);
        }
        interval = Math.min(interval * 1.3, POLL_INTERVAL_MAX_MS);
      }

      throw new Error(`Timed out for ${endpoint.id}`);
    } catch (err: any) {
      lastError = err;
      console.warn(`Upscaler ${endpoint.id} failed:`, err.message);
      continue;
    }
  }

  throw lastError || new Error("All upscaler endpoints failed");
}
