import type { GenerationParams } from "../types";
import { apiFetch, sleep } from "./helpers";
import {
  POLL_INTERVAL_BASE_MS,
  POLL_INTERVAL_MAX_MS,
  POLL_MAX_ATTEMPTS,
} from "../constants";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  logs?: string;
  urls?: {
    get?: string;
    cancel?: string;
  };
}

const REPLICATE_PROXY = "/api/replicate";
const REPLICATE_API_BASE = "https://api.replicate.com/v1";

function buildReplicateInput(params: GenerationParams): Record<string, unknown> {
  const modelSlug = params.model.endpoint;
  const input: Record<string, unknown> = {
    prompt: params.prompt,
  };

  if (modelSlug.includes("minimax")) {
    // minimax/video-01 uses first_frame_image
    (input as any).first_frame_image = params.imageUrl;
    if (params.durationSeconds) {
      (input as any).duration = params.durationSeconds;
    }
  } else if (modelSlug.includes("wan-2.7")) {
    // wan-video/wan-2.7-i2v uses first_frame, prompt, resolution, duration
    (input as any).first_frame = params.imageUrl;
    (input as any).resolution = "1080p";
    if (params.durationSeconds) {
      (input as any).duration = Math.min(Math.max(params.durationSeconds, 2), 15);
    }
    if (params.negativePrompt && params.model.supportsNegativePrompt) {
      (input as any).negative_prompt = params.negativePrompt;
    }
    if (params.seed !== null && params.model.supportsSeed) {
      (input as any).seed = params.seed;
    }
    if (params.aspectRatio) {
      // Wan 2.7 resolution handling - aspect ratio derived from image, but we can keep
      (input as any).aspect_ratio = params.aspectRatio;
    }
  } else if (modelSlug.includes("wan-2.1")) {
    // wavespeedai/wan-2.1-i2v-720p uses image, prompt, aspect_ratio, seed
    (input as any).image = params.imageUrl;
    if (params.seed !== null && params.model.supportsSeed) {
      (input as any).seed = params.seed;
    }
    if (params.negativePrompt && params.model.supportsNegativePrompt) {
      (input as any).negative_prompt = params.negativePrompt;
    }
    if (params.aspectRatio) {
      (input as any).aspect_ratio = params.aspectRatio;
    }
    // Duration via num_frames: 81 frames ~5s at 16fps
    if (params.durationSeconds) {
      const fps = 16;
      (input as any).num_frames = Math.min(100, Math.max(5, Math.round(params.durationSeconds * fps)));
      (input as any).frames_per_second = fps;
    }
  } else if (modelSlug.includes("wan")) {
    // generic wan fallback
    (input as any).image = params.imageUrl;
    if (params.seed !== null) {
      (input as any).seed = params.seed;
    }
    if (params.negativePrompt && params.model.supportsNegativePrompt) {
      (input as any).negative_prompt = params.negativePrompt;
    }
    if (params.durationSeconds) {
      (input as any).duration = params.durationSeconds;
    }
    if (params.aspectRatio) {
      (input as any).aspect_ratio = params.aspectRatio;
    }
  } else {
    // generic
    (input as any).start_image = params.imageUrl;
    if (params.durationSeconds) {
      (input as any).duration = params.durationSeconds;
    }
    if (params.aspectRatio) {
      (input as any).aspect_ratio = params.aspectRatio;
    }
  }

  return input;
}

export async function submitReplicateJob(
  params: GenerationParams,
  apiKey: string
): Promise<{ predictionId: string }> {
  const modelSlug = params.model.endpoint;
  const targetPath = `/v1/models/${modelSlug}/predictions`;

  const input = buildReplicateInput(params);

  let res: Response;

  try {
    res = await apiFetch(REPLICATE_PROXY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ targetPath, input }),
    });
  } catch {
    try {
      res = await apiFetch(`${REPLICATE_API_BASE}${targetPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Prefer: "respond-async",
        },
        body: JSON.stringify({ input }),
      });
    } catch (err: unknown) {
      if (
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        throw new Error(
          "Replicate API request failed. Deploy to Vercel to enable the proxy, " +
            "or use fal.ai models which work via /api/fal proxy."
        );
      }
      throw err;
    }
  }

  let json: ReplicatePrediction;
  try {
    json = await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Replicate returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 400)}`
    );
  }

  if (!json.id) {
    throw new Error(
      `Replicate did not return a prediction ID: ${JSON.stringify(json).slice(0, 500)}`
    );
  }

  return { predictionId: json.id };
}

export async function pollReplicateJob(
  predictionId: string,
  apiKey: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const targetPath = `/v1/predictions/${predictionId}`;
  let interval = POLL_INTERVAL_BASE_MS;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(interval);

    let res: Response;

    try {
      res = await apiFetch(`${REPLICATE_PROXY}?targetPath=${encodeURIComponent(targetPath)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
    } catch {
      try {
        res = await apiFetch(`${REPLICATE_API_BASE}${targetPath}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
      } catch (err: unknown) {
        if (
          err instanceof TypeError ||
          (err instanceof Error && err.message.includes("fetch"))
        ) {
          throw new Error(
            "Replicate API request failed. Deploy to Vercel to enable the proxy."
          );
        }
        throw err;
      }
    }

    let prediction: ReplicatePrediction;
    try {
      prediction = await res.json();
    } catch {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Replicate returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 400)}`
      );
    }

    if (prediction.logs && onProgress) {
      onProgress(prediction.logs.slice(-300));
    }

    if (prediction.status === "succeeded") {
      const output = prediction.output;
      if (typeof output === "string") return output;
      if (Array.isArray(output) && output.length > 0) return output[0];
      throw new Error(
        `Replicate succeeded but no output URL: ${JSON.stringify(prediction).slice(0, 500)}`
      );
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new Error(
        `Replicate prediction ${prediction.status}: ${prediction.error || "unknown error"}`
      );
    }

    interval = Math.min(interval * 1.3, POLL_INTERVAL_MAX_MS);
  }

  throw new Error(
    `Replicate prediction did not complete within ${POLL_MAX_ATTEMPTS} poll attempts.`
  );
}
