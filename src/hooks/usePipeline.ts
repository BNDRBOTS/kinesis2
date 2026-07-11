import { useState, useRef, useCallback } from "react";
import type {
  GenerationParams,
  PipelineState,
  VideoSegment,
  ApiKeys,
  FeatureSwitches,
  CreationHistoryItem,
} from "../types";
import { runPipeline } from "../api/orchestrator";
import { v4 as uuidv4 } from "uuid";

export function usePipeline(apiKeys: ApiKeys) {
  const [pipelineState, setPipelineState] = useState<PipelineState>({
    status: "idle",
    segments: [],
    stitchedUrl: null,
    targetDurationSeconds: 0,
    error: null,
    audioUrl: null,
    upscaledUrl: null,
  });
  const [activeLogs, setActiveLogs] = useState<Record<string, string[]>>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateSegment = useCallback((segment: VideoSegment) => {
    setPipelineState((prev) => {
      const segments = [...prev.segments];
      const idx = segments.findIndex((s) => s.id === segment.id);
      if (idx >= 0) {
        segments[idx] = segment;
      } else {
        segments.push(segment);
        segments.sort((a, b) => a.index - b.index);
      }
      return { ...prev, segments };
    });
  }, []);

  const startPipeline = useCallback(
    async (
      params: GenerationParams,
      targetDuration: number,
      switches: FeatureSwitches,
      onSaveHistory?: (item: CreationHistoryItem) => void
    ) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setPipelineState({
        status: "generating",
        segments: [],
        stitchedUrl: null,
        targetDurationSeconds: targetDuration,
        error: null,
        audioUrl: null,
        upscaledUrl: null,
      });
      setActiveLogs({});

      let finalStitchedUrl: string | null = null;
      let finalAudioUrl: string | null = null;
      let finalUpscaledUrl: string | null = null;
      let finalSegments: VideoSegment[] = [];

      try {
        await runPipeline(
          params,
          targetDuration,
          apiKeys,
          switches,
          {
            onSegmentCreated: (seg) => {
              finalSegments.push(seg);
              updateSegment(seg);
            },
            onSegmentUpdated: (seg) => {
              const idx = finalSegments.findIndex((s) => s.id === seg.id);
              if (idx >= 0) finalSegments[idx] = seg;
              updateSegment(seg);
            },
            onStitchStart: () =>
              setPipelineState((prev) => ({ ...prev, status: "stitching" })),
            onStitchComplete: (url: string) => {
              finalStitchedUrl = url;
              setPipelineState((prev) => ({
                ...prev,
                status: switches.generateFoleyAudio || switches.aiUpscaleFinal ? prev.status : "complete",
                stitchedUrl: url,
              }));
            },
            onAudioStart: () => {
              setActiveLogs((prev) => ({ ...prev, sys: [...(prev.sys || []), "Generating cinematic Foley sound effects..."] }));
            },
            onAudioComplete: (url: string) => {
              finalAudioUrl = url;
              setPipelineState((prev) => ({
                ...prev,
                status: switches.aiUpscaleFinal ? prev.status : "complete",
                audioUrl: url,
              }));
            },
            onUpscaleStart: () => {
              setActiveLogs((prev) => ({ ...prev, sys: [...(prev.sys || []), "Executing 4K / 60fps AI AI Video Upscaling..."] }));
            },
            onUpscaleComplete: (url: string) => {
              finalUpscaledUrl = url;
              setPipelineState((prev) => ({
                ...prev,
                status: "complete",
                upscaledUrl: url,
              }));
            },
            onError: (error: string) =>
              setPipelineState((prev) => ({ ...prev, status: "error", error })),
            onProgress: (segmentId: string, msg: string) => {
              setActiveLogs((prevLogs) => {
                const current = prevLogs[segmentId] || [];
                return {
                  ...prevLogs,
                  [segmentId]: [...current, msg],
                };
              });
            },
          },
          abortControllerRef.current.signal
        );

        // If completed successfully and we have onSaveHistory
        if (onSaveHistory && finalSegments.some((s) => s.status === "succeeded")) {
          onSaveHistory({
            id: uuidv4(),
            timestamp: Date.now(),
            title: params.prompt.slice(0, 45) || "Untitled Cinematic Sequence",
            prompt: params.prompt,
            negativePrompt: params.negativePrompt,
            targetDurationSeconds: targetDuration,
            aspectRatio: params.aspectRatio,
            modelLabel: params.model.label,
            stitchedUrl: finalStitchedUrl,
            audioUrl: finalAudioUrl,
            upscaledUrl: finalUpscaledUrl,
            segments: finalSegments,
          });
        }
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setPipelineState((prev) => ({
            ...prev,
            status: "error",
            error: err?.message || "An unexpected pipeline failure occurred.",
          }));
        }
      } finally {
        abortControllerRef.current = null;
      }
    },
    [apiKeys, updateSegment]
  );

  const cancelPipeline = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setPipelineState((prev) => ({
      ...prev,
      status: prev.status === "generating" ? "error" : prev.status,
      error: prev.status === "generating" ? "Pipeline cancelled by user." : prev.error,
    }));
  }, []);

  return {
    pipelineState,
    activeLogs,
    startPipeline,
    cancelPipeline,
  };
}
