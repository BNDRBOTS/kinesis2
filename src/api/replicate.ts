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

export async function submitReplicateJob(
  params: GenerationParams,
  apiKey: string
): Promise<{ predictionId: string }> {
  const modelSlug = params.model.endpoint;
  const targetPath = `/v1/models/${modelSlug}/predictions`;

  const input: Record<string, unknown> = {
    prompt: params.prompt,
  };

  if (modelSlug.includes("minimax")) {
    input.first_frame_image = params.imageUrl;
  } else if (modelSlug.includes("wan")) {
    input.image = params.imageUrl;
    if (params.seed !== null) {
      input.seed = params.seed;
    }
    if (params.negativePrompt && params.model.supportsNegativePrompt) {
      input.negative_prompt = params.negativePrompt;
    }
  } else {
    input.start_image = params.imageUrl;
  }

  if (params.durationSeconds) {
    input.duration = params.durationSeconds;
  }

  if (params.aspectRatio) {
    input.aspect_ratio = params.aspectRatio;
  }

  let res: Response;
  let usedProxy = false;

  try {
    res = await apiFetch(REPLICATE_PROXY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ targetPath, input }),
    });
    usedProxy = true;
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
            "or use fal.ai/Luma models which work directly in browser."
        );
      }
      throw err;
    }
  }

  void usedProxy;

  let json: ReplicatePrediction;
  try {
    json = await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Replicate returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 200)}`
    );
  }

  if (!json.id) {
    throw new Error(
      `Replicate did not return a prediction ID: ${JSON.stringify(json).slice(0, 300)}`
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
        `Replicate returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 200)}`
      );
    }

    if (prediction.logs && onProgress) {
      onProgress(prediction.logs.slice(-200));
    }

    if (prediction.status === "succeeded") {
      const output = prediction.output;
      if (typeof output === "string") return output;
      if (Array.isArray(output) && output.length > 0) return output[0];
      throw new Error(
        `Replicate succeeded but no output URL: ${JSON.stringify(prediction).slice(0, 300)}`
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
