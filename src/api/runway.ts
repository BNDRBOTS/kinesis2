import type { GenerationParams } from "../types";
import { apiFetch, sleep } from "./helpers";
import {
  POLL_INTERVAL_BASE_MS,
  POLL_INTERVAL_MAX_MS,
  POLL_MAX_ATTEMPTS,
} from "../constants";

interface RunwayTaskResponse {
  id: string;
  status?: string;
}

interface RunwayTaskStatus {
  id: string;
  status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "THROTTLED";
  output?: string[];
  failure?: string;
  failureCode?: string;
}

const RUNWAY_PROXY = "/api/runway";
const RUNWAY_API_BASE = "https://api.dev.runwayml.com/v1";

function mapAspectRatioToRunwayRatio(aspectRatio: string, modelEndpoint: string): string {
  // Gen-4 and Gen-4.5 use explicit resolution ratios
  const isGen4 = modelEndpoint.includes("gen4");
  
  if (isGen4) {
    switch (aspectRatio) {
      case "16:9":
        return "1280:720";
      case "9:16":
        return "720:1280";
      case "1:1":
        return "960:960";
      case "1280:720":
        return "1280:720";
      case "720:1280":
        return "720:1280";
      default:
        // Try to parse if already in W:H format
        if (aspectRatio.includes(":")) {
          // If it's like 16:9, convert to gen4 format
          if (aspectRatio === "16:9") return "1280:720";
          if (aspectRatio === "9:16") return "720:1280";
          // Otherwise return as-is if it looks like resolution ratio
          return aspectRatio;
        }
        return "1280:720";
    }
  } else {
    // Legacy Gen-3 uses simple ratios
    if (aspectRatio === "9:16") return "9:16";
    return "16:9";
  }
}

export async function submitRunwayJob(
  params: GenerationParams,
  apiKey: string
): Promise<{ taskId: string }> {
  const targetPath = "/v1/image_to_video";

  const ratio = mapAspectRatioToRunwayRatio(params.aspectRatio, params.model.endpoint);

  const body: Record<string, unknown> = {
    model: params.model.endpoint,
    promptImage: params.imageUrl,
    promptText: params.prompt.slice(0, 1000), // Gen-4 allows longer prompts
    duration: params.durationSeconds,
    ratio,
    watermark: false,
  };

  if (params.seed !== null && params.model.supportsSeed) {
    body.seed = params.seed;
  }

  // Gen-4.5 supports additional params
  if (params.model.endpoint === "gen4.5") {
    // Gen-4.5 can handle up to 10s in API, supports longer prompts
    (body as any).promptText = params.prompt.slice(0, 2000);
  }

  let res: Response;

  try {
    res = await apiFetch(RUNWAY_PROXY, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Runway-Version": "2024-11-06",
      },
      body: JSON.stringify({ targetPath, ...body }),
    });
  } catch {
    try {
      res = await apiFetch(`${RUNWAY_API_BASE}${targetPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "X-Runway-Version": "2024-11-06",
        },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      if (
        err instanceof TypeError ||
        (err instanceof Error && err.message.includes("fetch"))
      ) {
        throw new Error(
          "Runway API request failed. Deploy to Vercel to enable the /api/runway proxy. " +
            "Alternatively, use fal.ai Kling v3 or LTX-2.5 models which work via /api/fal proxy."
        );
      }
      throw err;
    }
  }

  let json: RunwayTaskResponse;
  try {
    json = await res.json();
  } catch {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Runway returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 400)}`
    );
  }

  if (!json.id) {
    throw new Error(
      `Runway did not return a task ID: ${JSON.stringify(json).slice(0, 500)}`
    );
  }

  return { taskId: json.id };
}

export async function pollRunwayJob(
  taskId: string,
  apiKey: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const targetPath = `/v1/tasks/${taskId}`;
  let interval = POLL_INTERVAL_BASE_MS;

  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    await sleep(interval);

    let res: Response;

    try {
      res = await apiFetch(`${RUNWAY_PROXY}?targetPath=${encodeURIComponent(targetPath)}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Runway-Version": "2024-11-06",
        },
      });
    } catch {
      try {
        res = await apiFetch(`${RUNWAY_API_BASE}${targetPath}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "X-Runway-Version": "2024-11-06",
          },
        });
      } catch (err: unknown) {
        if (
          err instanceof TypeError ||
          (err instanceof Error && err.message.includes("fetch"))
        ) {
          throw new Error(
            "Runway API request failed. Deploy to Vercel to enable the proxy."
          );
        }
        throw err;
      }
    }

    let task: RunwayTaskStatus;
    try {
      task = await res.json();
    } catch {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Runway returned invalid JSON (HTTP ${res.status}): ${text.slice(0, 400)}`
      );
    }

    if (onProgress) {
      onProgress(`Runway task ${task.id}: ${task.status}`);
    }

    if (task.status === "SUCCEEDED") {
      if (!task.output || task.output.length === 0) {
        throw new Error("Runway task succeeded but returned no output URLs.");
      }
      return task.output[0];
    }

    if (task.status === "FAILED") {
      throw new Error(
        `Runway task failed: ${task.failure || task.failureCode || "unknown"}`
      );
    }

    interval = Math.min(interval * 1.3, POLL_INTERVAL_MAX_MS);
  }

  throw new Error(
    `Runway task did not complete within ${POLL_MAX_ATTEMPTS} poll attempts.`
  );
}
