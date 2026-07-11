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

const LUMA_API_BASE = "https://api.lumalabs.ai/dream-machine/v1";

export async function submitLumaJob(
  params: GenerationParams,
  apiKey: string
): Promise<{ generationId: string }> {
  const url = `${LUMA_API_BASE}/generations`;

  const body: Record<string, unknown> = {
    prompt: params.prompt,
    model: params.model.endpoint,
    aspect_ratio: params.aspectRatio || "16:9",
    keyframes: {
      frame0: {
        type: "image",
        url: params.imageUrl,
      },
    },
  };

  const res = await apiFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  let json: LumaGeneration;
  try {
    json = await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Luma returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 200)}`
    );
  }

  if (!json.id) {
    throw new Error(
      `Luma did not return a generation ID: ${JSON.stringify(json).slice(0, 300)}`
    );
  }

  return { generationId: json.id };
}

export async function pollLumaJob(
  generationId: string,
  apiKey: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const pollUrl = `${LUMA_API_BASE}/generations/${generationId}`;
  let interval = POLL_INTERVAL_BASE_MS;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(interval);

    const res = await apiFetch(pollUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    let gen: LumaGeneration;
    try {
      gen = await res.json();
    } catch {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Luma returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 200)}`
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
