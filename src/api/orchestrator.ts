import { runComfyCloud } from './comfyCloud';
import { planDurations } from '../duration';
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
import { extractLastFrame, stitchVideos, cacheVideo } from "./helpers";
import { ensureImageUrl, uploadToFal, prepareModelImage } from "./imageUpload";
import { v4 as uuidv4 } from "uuid";

export async function generateSingleSegment(
  params: GenerationParams,
  apiKeys: ApiKeys,
  onProgress?: (msg: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const provider: Provider = params.model.provider;

  switch (provider) {
    case "comfyCloud": return runComfyCloud(params, apiKeys.comfyCloud || "", onProgress, signal);
    case "comfyui": {
      const key = apiKeys.comfyui;
      if (!key) throw new Error("ComfyUI Server URL is not configured. Please enter your local or hosted ComfyUI server URL in the API Keys panel.");
      const { promptId } = await submitComfyUIJob(params, key, signal);
      return await pollComfyUIJob(promptId, key, onProgress, signal);
    }

    case "fal": {
      const key = apiKeys.fal;
      if (!key) throw new Error("fal.ai API key is not configured. Please configure your key in the API Keys panel.");
      const { statusUrl, responseUrl } = await submitFalJob(params, key, signal);
      return await pollFalJob(statusUrl, responseUrl, key, onProgress, signal);
    }

    case "replicate": {
      const key = apiKeys.replicate;
      if (!key) throw new Error("Replicate API token is not configured. Please configure your token in the API Keys panel.");
      const { predictionId } = await submitReplicateJob(params, key, signal);
      return await pollReplicateJob(predictionId, key, onProgress, signal);
    }

    case "runway": {
      const key = apiKeys.runway;
      if (!key) throw new Error("Runway API key is not configured. Please configure your key in the API Keys panel.");
      const { taskId } = await submitRunwayJob(params, key, signal);
      return await pollRunwayJob(taskId, key, onProgress, signal);
    }

    case "luma": {
      const key = apiKeys.luma;
      if (!key) throw new Error("Luma AI API key is not configured. Please configure your key in the API Keys panel.");
      const { generationId } = await submitLumaJob(params, key, signal);
      return await pollLumaJob(generationId, key, onProgress, signal);
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

export function computeSegmentCount(targetDuration: number, perSegmentMax: number): number {
  return computeSegmentDurations(targetDuration, perSegmentMax).length;
}
export function computeSegmentDurations(targetDuration: number, perSegmentMax: number): number[] {
  return planDurations(targetDuration, perSegmentMax, { maxDurationSeconds: perSegmentMax });
}

export async function runPipeline(
  baseParams: GenerationParams,
  targetDuration: number,
  apiKeys: ApiKeys,
  switches: FeatureSwitches,
  callbacks: PipelineCallbacks,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted();
  if (baseParams.model.supportsSeed && baseParams.seed !== null && (!Number.isInteger(baseParams.seed) || baseParams.seed < 0 || baseParams.seed > (baseParams.model.provider === 'runway' ? 4294967295 : 2147483647))) throw new Error('Invalid seed for selected model');
  if (baseParams.model.supportsSeed && baseParams.seed === null) baseParams = { ...baseParams, seed: Math.floor(Math.random() * 2147483647) };
  const durations = planDurations(targetDuration, baseParams.durationSeconds, baseParams.model);
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
      signal.throwIfAborted();
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
        await prepareModelImage(seg.params, signal),
        seg.params.model.provider,
        apiKeys, signal
      );

      const paramsWithHostedImage: GenerationParams = {
        ...seg.params,
        imageUrl: hostedImageUrl,
      };

      seg.params = paramsWithHostedImage;
      const videoUrl = await generateSingleSegment(
        paramsWithHostedImage,
        apiKeys,
        (msg) => callbacks.onProgress(seg.id, msg), signal
      );

      signal?.throwIfAborted();
      seg.videoUrl = videoUrl;
      callbacks.onSegmentUpdated(seg);


      // We only extract the last frame if we have another segment to render
      if (i < segments.length - 1) {
        seg.lastFrameUrl = await extractLastFrame(videoUrl, signal);
      }

      if (switches.keepIntermediateSlices) {
        try { seg.videoUrl = await cacheVideo(videoUrl, signal); }
        catch (error) { signal?.throwIfAborted(); callbacks.onProgress(seg.id, `Local archive unavailable; provider URL retained: ${String(error)}`); }
      }
      completedVideoUrls.push(seg.videoUrl!);
      seg.status = "succeeded";
      callbacks.onSegmentUpdated(seg);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown generation error";
      seg.status = signal?.aborted ? "cancelled" : "failed";
      seg.error = message;
      callbacks.onSegmentUpdated(seg);
      callbacks.onError(`Segment #${i + 1} failed: ${message}`);

      for (let j = i + 1; j < segments.length; j++) {
        segments[j].status = "cancelled";
        segments[j].error = "Cancelled due to prior segment failure.";
        callbacks.onSegmentUpdated(segments[j]);
      }
      throw err;
    }
  }

  signal?.throwIfAborted();

  if (completedVideoUrls.length === 0) return;

  let finalOutputUrl = completedVideoUrls[0];
  let finalDuration = durations[0];

  // Concatenation Stitching
  if (completedVideoUrls.length > 1 && switches.autoStitch) {
    callbacks.onStitchStart();
    try {
      finalOutputUrl = await stitchVideos(completedVideoUrls, signal);
      finalDuration = durations.reduce((a,b)=>a+b,0);
      callbacks.onStitchComplete(finalOutputUrl);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unknown stitching error";
      signal?.throwIfAborted();
      console.warn(`Stitching encountered an issue: ${message}. Using first completed video as final preview.`);
      callbacks.onProgress(segments[0].id, `Stitch failed: ${message}. Individual segments remain available.`);
      callbacks.onStitchComplete(completedVideoUrls[0]);
    }
  } else {
    callbacks.onStitchComplete(finalOutputUrl);
  }

  let postInput = finalOutputUrl;
  if ((switches.generateFoleyAudio || switches.aiUpscaleFinal) && apiKeys.fal && !postInput.startsWith('https://')) {
    try { postInput = await uploadToFal(postInput, apiKeys.fal, signal); }
    catch (err) { signal?.throwIfAborted(); callbacks.onProgress(segments[0].id, `Post-processing upload failed: ${String(err)}`); return; }
  }
  if ((switches.generateFoleyAudio || switches.aiUpscaleFinal) && !apiKeys.fal) callbacks.onProgress(segments[0].id, 'Optional processing skipped: Fal credentials not configured.');

  // Optional Foley Audio Sound Effects Generation
  if (switches.generateFoleyAudio && apiKeys.fal && !signal?.aborted) {
    callbacks.onAudioStart();
    try {
      const audioUrl = await generateFalFoleyAudio(
        postInput,
        switches.foleyPrompt || baseParams.prompt,
        apiKeys.fal,
        (msg) => callbacks.onProgress(segments[0].id, msg), signal, finalDuration
      );
      signal?.throwIfAborted();
      callbacks.onAudioComplete(audioUrl);
      postInput = audioUrl;
    } catch (audErr: unknown) {
      const message = audErr instanceof Error ? audErr.message : "Unknown audio failure";
      signal?.throwIfAborted();
      console.warn("Foley Audio generation failed:", message);
      callbacks.onProgress(segments[0].id, `⚠️ Foley Audio skipped: ${message}`);
    }
  }

  // Optional 2× spatial upscaling; use Foley result when available
  if (switches.aiUpscaleFinal && apiKeys.fal && !signal?.aborted) {
    callbacks.onUpscaleStart();
    try {
      const upscaledUrl = await upscaleFalVideo(
        postInput,
        apiKeys.fal,
        (msg) => callbacks.onProgress(segments[0].id, msg), signal
      );
      signal?.throwIfAborted();
      callbacks.onUpscaleComplete(upscaledUrl);
    } catch (upErr: unknown) {
      const message = upErr instanceof Error ? upErr.message : "Unknown upscaler failure";
      signal?.throwIfAborted();
      console.warn("AI Video Upscaling failed:", message);
      callbacks.onProgress(segments[0].id, `⚠️ 2× AI Upscale skipped: ${message}`);
    }
  }
}
