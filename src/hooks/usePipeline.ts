import { useState, useRef, useCallback } from 'react';
import type { GenerationParams, PipelineState, VideoSegment, ApiKeys, FeatureSwitches, CreationHistoryItem } from '../types';
import { runPipeline } from '../api/orchestrator';
import { v4 as uuidv4 } from 'uuid';
const initial: PipelineState = { status: 'idle', segments: [], stitchedUrl: null, targetDurationSeconds: 0, error: null, audioUrl: null, upscaledUrl: null };
export function usePipeline(apiKeys: ApiKeys) {
  const [pipelineState, setPipelineState] = useState<PipelineState>(initial);
  const [activeLogs, setActiveLogs] = useState<Record<string,string[]>>({});
  const active = useRef<AbortController | null>(null);
  const startPipeline = useCallback(async (params: GenerationParams, targetDuration: number, switches: FeatureSwitches, save?: (item: CreationHistoryItem) => void) => {
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    const current = () => active.current === controller && !controller.signal.aborted;
    let state: PipelineState = { ...initial, segments: [], status: 'generating', targetDurationSeconds: targetDuration };
    setPipelineState(state); setActiveLogs({});
    const patch = (update: Partial<PipelineState>) => { if (current()) { state = { ...state, ...update }; setPipelineState(state); } };
    const segment = (seg: VideoSegment) => {
      const copy = { ...seg, params: { ...seg.params } };
      patch({ segments: [...state.segments.filter(s => s.id !== seg.id), copy].sort((a,b)=>a.index-b.index) });
    };
    const log = (id: string, msg: string) => { if (current()) setActiveLogs(prev => ({ ...prev, [id]: [...(prev[id] || []).slice(-199), msg] })); };
    try {
      await runPipeline(params, targetDuration, apiKeys, switches, {
        onSegmentCreated: segment, onSegmentUpdated: segment,
        onStitchStart: () => patch({ status: 'stitching' }),
        onStitchComplete: url => patch({ stitchedUrl: url }),
        onAudioStart: () => log('sys', 'Generating Foley video with synchronized sound…'),
        onAudioComplete: url => patch({ audioUrl: url }),
        onUpscaleStart: () => log('sys', 'Upscaling video 2×…'),
        onUpscaleComplete: url => patch({ upscaledUrl: url }),
        onProgress: log, onError: error => patch({ status: 'error', error }),
      }, controller.signal);
      if (!current()) return;
      if (!state.stitchedUrl) throw new Error('Generation finished without output');
      patch({ status: 'complete' });
      save?.({ id: uuidv4(), timestamp: Date.now(), title: params.prompt.slice(0,45) || 'Untitled sequence', prompt: params.prompt, negativePrompt: params.negativePrompt, targetDurationSeconds: targetDuration, aspectRatio: params.aspectRatio, modelLabel: params.model.label, stitchedUrl: state.stitchedUrl, audioUrl: state.audioUrl, upscaledUrl: state.upscaledUrl, segments: state.segments.map(s => ({ ...s, lastFrameUrl: null, params: { ...s.params, imageUrl: s.index === 0 ? s.params.imageUrl : "" } })) });
    } catch (err) {
      if (current()) patch({ status: 'error', error: err instanceof Error ? err.message : 'Pipeline failed' });
    } finally { if (active.current === controller) active.current = null; }
  }, [apiKeys]);
  const cancelPipeline = useCallback(() => {
    active.current?.abort(); active.current = null;
    setPipelineState(prev => ({ ...prev, status: 'error', error: 'Pipeline cancelled by user. Provider work already running may still be billed.', segments: prev.segments.map(s => ['queued','submitting','processing'].includes(s.status) ? { ...s, status: 'cancelled' } : s) }));
  }, []);
  return { pipelineState, activeLogs, startPipeline, cancelPipeline };
}
