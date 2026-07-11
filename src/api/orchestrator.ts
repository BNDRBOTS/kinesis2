import type {
  GenerationParams,
  VideoSegment,
  ApiKeys,
  Provider,
  FeatureSwitches,
} from "../types";
import { submitComfyUIJob, pollComfyUIJob } from "./comfyui";
import { submitFalJob, pollFalJob, generateFalFoleyAudio, upscaleFalVideo } from "./fal";
import { submitReplicateJob, pollReplicateJob } from "./replicate";
import { submitRunwayJob, pollRunwayJob } from "./runway";
import { submitLumaJob, pollLumaJob } from "./luma";
import { extractLastFrame, stitchVideos } from "./helpers";
import { ensureImageUrl } from "./imageUpload";
import { v4 as uuidv4 } from "uuid";

export async function generateSingleSegment(
  params: GenerationParams,
  apiKeys: ApiKeys,
  onProgress?: (msg: string) => void
): Promise<string> {
  const provider: Provider = params.model.provider;

  switch (provider) {
    case "comfyui": {
      const key = apiKeys.comfyui;
      if (!key) throw new Error("ComfyUI Server URL is not configured. Please enter your local or hosted ComfyUI server URL in the API Keys panel.");
      const { promptId } = await submitComfyUIJob(params, key);
      return await pollComfyUIJob(promptId, key, onProgress);
    }

    case "fal": {
      const key = apiKeys.fal;
      if (!key) throw new Error("fal.ai API key is not configured. Please configure your key in the API Keys panel.");
      const { statusUrl, responseUrl } = await submitFalJob(params, key);
      return await pollFalJob(statusUrl, responseUrl, key, onProgress);
    }

    case "replicate": {
      const key = apiKeys.replicate;
      if (!key) throw new Error("Replicate API token is not configured. Please configure your token in the API Keys panel.");
      const { predictionId } = await submitReplicateJob(params, key);
      return await pollReplicateJob(predictionId, key, onProgress);
    }

    case "runway": {
      const key = apiKeys.runway;
      if (!key) throw new Error("Runway API key is not configured. Please configure your key in the API Keys panel.");
      const { taskId } = await submitRunwayJob(params, key);
      return await pollRunwayJob(taskId, key, onProgress);
    }

    case "luma": {
      const key = apiKeys.luma;
      if (!key) throw new Error("Luma AI API key is not configured. Please configure your key in the API Keys panel.");
      const { generationId } = await submitLumaJob(params, key);
      return await pollLumaJob(generationId, key, onProgress);
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export interface PipelineCallbacks {
  onSegmentCreated: (segment: VideoSegment) => void;
  onSegmentUpdated: (segment: VideoSegment) => void;
  onStitchStart: () => void;
  onStitchComplete: (url: string) => void;
  onAudioStart: () => void;
  onAudioComplete: (url: string) => void;
  onUpscaleStart: () => void;
  onUpscaleComplete: (url: string) => void;
  onError: (error: string) => void;
  onProgress: (segmentId: string, msg: string) => void;
}

export function computeSegmentCount(
  targetDuration: number,
  perSegmentMax: number
): number {
  if (targetDuration <= 0 || perSegmentMax <= 0) return 1;
  return Math.ceil(targetDuration / perSegmentMax);
}

export function computeSegmentDurations(
  targetDuration: number,
  perSegmentMax: number
): number[] {
  const count = computeSegmentCount(targetDuration, perSegmentMax);
  const durations: number[] = [];
  let remaining = targetDuration;

  for (let i = 0; i < count; i++) {
    const dur = Math.min(remaining, perSegmentMax);
    durations.push(dur);
    remaining -= dur;
  }

  return durations;
}

export async function runPipeline(
  baseParams: GenerationParams,
  targetDuration: number,
  apiKeys: ApiKeys,
  switches: FeatureSwitches,
  callbacks: PipelineCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const maxDur = baseParams.model.maxDurationSeconds;
  const durations = computeSegmentDurations(targetDuration, maxDur);
  const segments: VideoSegment[] = [];
  const completedVideoUrls: string[] = [];

  for (let i = 0; i < durations.length; i++) {
    const seg: VideoSegment = {
      id: uuidv4(),
      index: i,
      status: "queued",
      remoteId: null,
      videoUrl: null,
      lastFrameUrl: null,
      error: null,
      pollCount: 0,
      params: {
        ...baseParams,
        durationSeconds: durations[i],
        imageUrl: i === 0 ? baseParams.imageUrl : "",
      },
      createdAt: Date.now(),
    };
    segments.push(seg);
    callbacks.onSegmentCreated(seg);
  }

  for (let i = 0; i < segments.length; i++) {
    if (signal?.aborted) {
      segments[i].status = "cancelled";
      callbacks.onSegmentUpdated(segments[i]);
      break;
    }

    const seg = segments[i];
    seg.status = "submitting";
    callbacks.onSegmentUpdated(seg);

    try {
      if (i > 0) {
        const prevSeg = segments[i - 1];
        if (!prevSeg.lastFrameUrl) {
          throw new Error(
            `Cannot chain segment #${i + 1}: previous segment failed or produced no ending keyframe.`
          );
        }
        seg.params = { ...seg.params, imageUrl: prevSeg.lastFrameUrl };
        if (baseParams.seed !== null && baseParams.model.supportsSeed) {
          seg.params.seed = baseParams.seed;
        }
      }

      seg.status = "processing";
      callbacks.onSegmentUpdated(seg);

      const hostedImageUrl = await ensureImageUrl(
        seg.params.imageUrl,
        seg.params.model.provider,
        apiKeys
      );

      const paramsWithHostedImage: GenerationParams = {
        ...seg.params,
        imageUrl: hostedImageUrl,
      };

      const videoUrl = await generateSingleSegment(
        paramsWithHostedImage,
        apiKeys,
        (msg) => callbacks.onProgress(seg.id, msg)
      );

      seg.videoUrl = videoUrl;
      completedVideoUrls.push(videoUrl);

      // We only extract the last frame if we have another segment to render
      if (i < segments.length - 1) {
        try {
          seg.lastFrameUrl = await extractLastFrame(videoUrl);
        } catch (frameErr) {
          console.warn(
            `Last-frame extraction failed for segment #${i + 1}; falling back to original source image.`,
            frameErr
          );
          seg.lastFrameUrl = baseParams.imageUrl;
        }
      }

      seg.status = "succeeded";
      callbacks.onSegmentUpdated(seg);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown generation error";
      seg.status = "failed";
      seg.error = message;
      callbacks.onSegmentUpdated(seg);
      callbacks.onError(`Segment #${i + 1} failed: ${message}`);

      for (let j = i + 1; j < segments.length; j++) {
        segments[j].status = "cancelled";
        segments[j].error = "Cancelled due to prior segment failure.";
        callbacks.onSegmentUpdated(segments[j]);
      }
      break;
    }
  }

  if (signal?.aborted) return;

  if (completedVideoUrls.length === 0) return;

  let finalOutputUrl = completedVideoUrls[0];

  // Concatenation Stitching
  if (completedVideoUrls.length > 1 && switches.autoStitch) {
    callbacks.onStitchStart();
    try {
      finalOutputUrl = await stitchVideos(completedVideoUrls);
      callbacks.onStitchComplete(finalOutputUrl);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown stitching error";
      console.warn(`Stitching encountered an issue: ${message}. Using first completed video as final preview.`);
      callbacks.onStitchComplete(completedVideoUrls[0]);
    }
  } else {
    callbacks.onStitchComplete(finalOutputUrl);
  }

  // Optional Foley Audio Sound Effects Generation
  if (switches.generateFoleyAudio && apiKeys.fal && !signal?.aborted) {
    callbacks.onAudioStart();
    try {
      const audioUrl = await generateFalFoleyAudio(
        finalOutputUrl,
        switches.foleyPrompt || baseParams.prompt,
        apiKeys.fal,
        (msg) => callbacks.onProgress(segments[0].id, msg)
      );
      callbacks.onAudioComplete(audioUrl);
    } catch (audErr: unknown) {
      const message = audErr instanceof Error ? audErr.message : "Unknown audio failure";
      console.warn("Foley Audio generation failed:", message);
      callbacks.onProgress(segments[0].id, `⚠️ Foley Audio skipped: ${message}`);
    }
  }

  // Optional AI Video Upscaling to 4K / 60fps
  if (switches.aiUpscaleFinal && apiKeys.fal && !signal?.aborted) {
    callbacks.onUpscaleStart();
    try {
      const upscaledUrl = await upscaleFalVideo(
        finalOutputUrl,
        apiKeys.fal,
        (msg) => callbacks.onProgress(segments[0].id, msg)
      );
      callbacks.onUpscaleComplete(upscaledUrl);
    } catch (upErr: unknown) {
      const message = upErr instanceof Error ? upErr.message : "Unknown upscaler failure";
      console.warn("AI Video Upscaling failed:", message);
      callbacks.onProgress(segments[0].id, `⚠️ 4K AI Upscale skipped: ${message}`);
    }
  }
}
