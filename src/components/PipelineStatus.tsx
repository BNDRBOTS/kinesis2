import type { VideoSegment, PipelineState } from "../types";
import { Loader2, CheckCircle2, AlertTriangle, XCircle, Clock, Terminal, Film } from "lucide-react";

interface Props {
  state: PipelineState;
  logs: string[];
}

function statusBadge(status: VideoSegment["status"]): {
  color: string;
  text: string;
  borderColor: string;
} {
  switch (status) {
    case "queued":
      return { color: "bg-neutral-800 text-neutral-400", text: "Queued", borderColor: "border-neutral-700" };
    case "submitting":
      return { color: "bg-amber-500/10 text-amber-400", text: "Submitting Engine", borderColor: "border-amber-500/30" };
    case "processing":
      return { color: "bg-sky-500/15 text-sky-400", text: "Processing Generation", borderColor: "border-sky-500/40 animate-pulse" };
    case "succeeded":
      return { color: "bg-emerald-500/10 text-emerald-400", text: "Succeeded", borderColor: "border-emerald-500/30" };
    case "failed":
      return { color: "bg-red-500/10 text-red-400", text: "Failed Execution", borderColor: "border-red-500/30" };
    case "cancelled":
      return { color: "bg-neutral-800 text-neutral-500", text: "Cancelled", borderColor: "border-neutral-700/60" };
    default:
      return { color: "bg-neutral-800 text-neutral-400", text: "Unknown", borderColor: "border-neutral-700" };
  }
}

export default function PipelineStatus({ state, logs }: Props) {
  if (state.status === "idle") return null;

  const completedCount = state.segments.filter((s) => s.status === "succeeded").length;
  const totalCount = state.segments.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6 rounded-3xl border border-neutral-800 bg-neutral-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur font-sans">
      {/* State Progress Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-neutral-950 via-neutral-900 to-sky-950/40 border border-neutral-800 shadow-inner">
        <div className="flex items-center gap-3.5">
          {(state.status === "generating" || state.status === "stitching") ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-lg shrink-0">
              <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
            </div>
          ) : state.status === "complete" ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg shrink-0">
              <CheckCircle2 className="h-6 w-6 text-emerald-400 animate-bounce" />
            </div>
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400 border border-red-500/20 shadow-lg shrink-0">
              <AlertTriangle className="h-6 w-6 text-red-400 animate-shake" />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-sky-400">
                Orchestrator Operation
              </span>
              <span className="inline-block h-2 w-2 rounded-full bg-sky-400 animate-ping" />
            </div>
            <h4 className="text-lg font-black text-white tracking-wide mt-0.5">
              {state.status === "generating" && "Generating continuous keyframe slices..."}
              {state.status === "stitching" && "Concatenating canvas WebM video segments..."}
              {state.status === "complete" && "Production sequence successfully generated."}
              {state.status === "error" && "Pipeline encountered an unexpected execution barrier."}
            </h4>
          </div>
        </div>

        {/* Total Segment Progress Indicator */}
        {totalCount > 0 && (
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-800">
            <div className="text-right">
              <span className="text-sm font-black text-white">{completedCount} / {totalCount}</span>
              <span className="text-xs font-bold text-neutral-400 ml-1">Clips</span>
              <p className="text-[10px] text-neutral-500 font-medium">Chained progress</p>
            </div>
            <div className="relative flex items-center justify-center h-12 w-12 rounded-full bg-neutral-950 border border-neutral-800">
              <span className="text-xs font-bold text-sky-400">{progressPercent}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Progress Bar Display */}
      {totalCount > 0 && (
        <div className="space-y-1.5">
          <div className="h-2 w-full bg-neutral-950 rounded-full overflow-hidden border border-neutral-800 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-blue-500 transition-all duration-500 rounded-full shadow-md shadow-sky-500/50"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Output Warning */}
      {state.error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-200 shadow-xl animate-shake">
          <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold uppercase text-xs tracking-wider text-red-400 block mb-0.5">Execution Interrupted</span>
            <span>{state.error}</span>
          </div>
        </div>
      )}

      {/* Grid of Video Segment Monitors */}
      {state.segments.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
              <Film className="h-4 w-4 text-sky-400" />
              <span>Execution Storyboard Slices</span>
            </span>
            <span className="text-[11px] text-neutral-500">Real-time status tracking</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {state.segments.map((seg) => {
              const badge = statusBadge(seg.status);
              return (
                <div
                  key={seg.id}
                  className={`flex flex-col justify-between p-3.5 rounded-2xl bg-neutral-950 border transition-all ${badge.borderColor} shadow-lg space-y-2.5`}
                  title={seg.error || `Segment #${seg.index + 1} parameters`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white">
                      Slice #{seg.index + 1}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.color}`}>
                      {badge.text}
                    </span>
                  </div>

                  {/* Visual Status Indicator Thumbnail / Icon */}
                  <div className="rounded-xl bg-neutral-900 border border-neutral-800/80 aspect-video flex items-center justify-center p-2 relative overflow-hidden group">
                    {seg.lastFrameUrl ? (
                      <img
                        src={seg.lastFrameUrl}
                        alt={`Slice #${seg.index + 1} frame`}
                        className="w-full h-full object-cover rounded-lg opacity-80"
                      />
                    ) : seg.status === "processing" ? (
                      <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
                    ) : seg.status === "succeeded" ? (
                      <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                    ) : seg.status === "failed" ? (
                      <AlertTriangle className="h-6 w-6 text-red-400" />
                    ) : seg.status === "cancelled" ? (
                      <XCircle className="h-6 w-6 text-neutral-600" />
                    ) : (
                      <Clock className="h-6 w-6 text-neutral-600" />
                    )}

                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] font-mono text-neutral-300 text-center px-1">
                        {seg.params.durationSeconds}s @ {seg.params.aspectRatio}
                      </span>
                    </div>
                  </div>

                  {seg.error && (
                    <p className="text-[10px] text-red-400 font-mono line-clamp-1">
                      {seg.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Streaming Terminal Execution Logs */}
      {logs.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
              <Terminal className="h-4 w-4 text-sky-400" />
              <span>Live System Execution Logs</span>
            </span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Direct Console
            </span>
          </div>

          <div className="max-h-40 overflow-y-auto rounded-2xl border border-neutral-800 bg-black p-4 font-mono text-xs text-neutral-300 shadow-inner space-y-1.5 leading-relaxed">
            {logs.map((log, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-sky-500 shrink-0">&gt;</span>
                <span className="text-neutral-300 break-all">{log}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
