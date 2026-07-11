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
}

export async function submitFalJob(
  params: GenerationParams,
  apiKey: string
): Promise<{ requestId: string; statusUrl: string; responseUrl: string }> {
  const endpointId = params.model.endpoint;
  const submitUrl = `https://queue.fal.run/${endpointId}`;

  const input: Record<string, unknown> = {
    prompt: params.prompt,
    duration: String(params.durationSeconds),
  };

  if (endpointId.includes("/v3/") || endpointId.includes("/v2/")) {
    input.start_image_url = params.imageUrl;
  } else {
    input.image_url = params.imageUrl;
  }

  if (params.negativePrompt && params.model.supportsNegativePrompt) {
    input.negative_prompt = params.negativePrompt;
  }

  if (params.cfgScale !== undefined) {
    input.cfg_scale = params.cfgScale;
  }

  if (params.aspectRatio) {
    input.aspect_ratio = params.aspectRatio;
  }

  const res = await apiFetch(submitUrl, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  let json: FalQueueResponse;
  try {
    json = await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    throw new Error(
      `fal.ai returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 200)}`
    );
  }

  if (!json.request_id) {
    throw new Error(
      `fal submit did not return a request_id: ${JSON.stringify(json).slice(0, 300)}`
    );
  }

  const statusUrl =
    json.status_url ||
    `https://queue.fal.run/${endpointId}/requests/${json.request_id}/status`;
  const responseUrl =
    json.response_url ||
    `https://queue.fal.run/${endpointId}/requests/${json.request_id}`;

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

    const res = await apiFetch(statusUrl, {
      method: "GET",
      headers: {
        Authorization: `Key ${apiKey}`,
      },
    });

    let status: FalStatusResponse;
    try {
      status = await res.json();
    } catch {
      const text = await res.text().catch(() => "");
      throw new Error(
        `fal.ai returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 200)}`
      );
    }

    if (status.logs && onProgress) {
      for (const log of status.logs) {
        onProgress(log.message);
      }
    }

    if (status.status === "COMPLETED") {
      const resultRes = await apiFetch(responseUrl, {
        method: "GET",
        headers: {
          Authorization: `Key ${apiKey}`,
        },
      });

      let result: FalResultResponse;
      try {
        result = await resultRes.json();
      } catch {
        const text = await resultRes.text().catch(() => "");
        throw new Error(
          `fal.ai result returned invalid JSON (HTTP ${resultRes.status}): ${text.slice(0, 200)}`
        );
      }

      if (!result.video?.url) {
        throw new Error(
          `fal job completed but no video URL in response: ${JSON.stringify(result).slice(0, 300)}`
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

export async function generateFalFoleyAudio(
  videoUrl: string,
  prompt: string,
  apiKey: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const submitUrl = `https://queue.fal.run/fal-ai/foley-sound-effects`;
  
  if (onProgress) onProgress("Submitting video to Foley Audio generator...");

  const res = await apiFetch(submitUrl, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_url: videoUrl,
      prompt: prompt || "cinematic sound effects, matching on-screen motion exactly",
    }),
  });

  let json: FalQueueResponse;
  try {
    json = await res.json();
  } catch {
    const text = await res.text();
    throw new Error(`Fal Foley submission returned invalid JSON: ${text.slice(0, 200)}`);
  }

  if (!json.request_id) {
    throw new Error("Fal Foley submission failed to return a request_id.");
  }

  const statusUrl = json.status_url || `https://queue.fal.run/fal-ai/foley-sound-effects/requests/${json.request_id}/status`;
  const responseUrl = json.response_url || `https://queue.fal.run/fal-ai/foley-sound-effects/requests/${json.request_id}`;

  let interval = POLL_INTERVAL_BASE_MS;
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(interval);
    if (onProgress) onProgress(`Polling Foley Audio job (attempt ${attempt + 1})...`);

    const statusRes = await apiFetch(statusUrl, { headers: { Authorization: `Key ${apiKey}` } });
    const status: FalStatusResponse = await statusRes.json();

    if (status.status === "COMPLETED") {
      const resultRes = await apiFetch(responseUrl, { headers: { Authorization: `Key ${apiKey}` } });
      const result: FalResultResponse = await resultRes.json();
      
      const audioUrl = result.audio?.url || result.audio_file?.url;
      if (!audioUrl) throw new Error("Foley sound generated but returned no audio URL.");
      return audioUrl;
    }

    if (status.status === "FAILED") {
      throw new Error("Foley sound effects generation failed. Please check parameters.");
    }
    interval = Math.min(interval * 1.3, POLL_INTERVAL_MAX_MS);
  }

  throw new Error("Timed out generating Foley sound effects.");
}

export async function upscaleFalVideo(
  videoUrl: string,
  apiKey: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const submitUrl = `https://queue.fal.run/fal-ai/video-upscaler`;
  
  if (onProgress) onProgress("Submitting video to 4K / 60fps AI Upscaler...");

  const res = await apiFetch(submitUrl, {
    method: "POST",
    headers: {
      Authorization: `Key ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_url: videoUrl,
      scale: 2,
    }),
  });

  let json: FalQueueResponse;
  try {
    json = await res.json();
  } catch {
    const text = await res.text();
    throw new Error(`Fal Upscaler submission returned invalid JSON: ${text.slice(0, 200)}`);
  }

  if (!json.request_id) {
    throw new Error("Fal Upscaler submission failed to return a request_id.");
  }

  const statusUrl = json.status_url || `https://queue.fal.run/fal-ai/video-upscaler/requests/${json.request_id}/status`;
  const responseUrl = json.response_url || `https://queue.fal.run/fal-ai/video-upscaler/requests/${json.request_id}`;

  let interval = POLL_INTERVAL_BASE_MS;
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(interval);
    if (onProgress) onProgress(`Polling 4K AI Upscale job (attempt ${attempt + 1})...`);

    const statusRes = await apiFetch(statusUrl, { headers: { Authorization: `Key ${apiKey}` } });
    const status: FalStatusResponse = await statusRes.json();

    if (status.status === "COMPLETED") {
      const resultRes = await apiFetch(responseUrl, { headers: { Authorization: `Key ${apiKey}` } });
      const result: FalResultResponse = await resultRes.json();
      
      if (!result.video?.url) throw new Error("Upscaler generated output but returned no video URL.");
      return result.video.url;
    }

    if (status.status === "FAILED") {
      throw new Error("Video AI Upscaling failed. Please check input media format.");
    }
    interval = Math.min(interval * 1.3, POLL_INTERVAL_MAX_MS);
  }

  throw new Error("Timed out waiting for Video AI Upscaler.");
}
