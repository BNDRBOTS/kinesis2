import { useCallback, useState } from "react";
import type { PipelineState, VideoSegment } from "../types";
import { Download, Film, Layers, CheckCircle2, Eye, ExternalLink, ShieldCheck, Volume2, Sparkles, Wand2 } from "lucide-react";

interface Props {
  state: PipelineState;
}

export default function VideoPlayer({ state }: Props) {
  const [activeTab, setActiveTab] = useState<"final" | "segments" | "audio" | "upscaled">("final");
  const videoUrl = state.stitchedUrl;
  const audioUrl = state.audioUrl;
  const upscaledUrl = state.upscaledUrl;

  const completedSegments = state.segments.filter(
    (s) => s.status === "succeeded" && s.videoUrl
  );

  const handleDownload = useCallback(
    async (url: string, filename: string) => {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      } catch {
        window.open(url, "_blank");
      }
    },
    []
  );

  if (!videoUrl && completedSegments.length === 0) return null;

  return (
    <div className="space-y-6 rounded-3xl border border-neutral-800 bg-neutral-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur font-sans">
      {/* Top Header and Tab Controller */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-sky-400">
            <Sparkles className="h-4 w-4" />
            <span>Master Output Suite</span>
          </span>
          <h3 className="text-2xl font-black text-white mt-1">
            Production Sequence Showcase
          </h3>
        </div>

        {/* Dynamic Showcase Navigation Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-neutral-950 p-1.5 rounded-2xl border border-neutral-800 w-full sm:w-auto">
          {videoUrl && (
            <button
              onClick={() => setActiveTab("final")}
              className={`flex-1 sm:flex-auto flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "final" ? "bg-sky-500 text-white shadow-md shadow-sky-500/20" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Film className="h-3.5 w-3.5" />
              <span>Stitched WebM</span>
            </button>
          )}

          {completedSegments.length > 0 && (
            <button
              onClick={() => setActiveTab("segments")}
              className={`flex-1 sm:flex-auto flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "segments" ? "bg-neutral-800 text-white shadow-md border border-neutral-700" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Slices ({completedSegments.length})</span>
            </button>
          )}

          {audioUrl && (
            <button
              onClick={() => setActiveTab("audio")}
              className={`flex-1 sm:flex-auto flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "audio" ? "bg-purple-600 text-white shadow-md shadow-purple-600/20" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Volume2 className="h-3.5 w-3.5 animate-bounce" />
              <span>Foley Audio</span>
            </button>
          )}

          {upscaledUrl && (
            <button
              onClick={() => setActiveTab("upscaled")}
              className={`flex-1 sm:flex-auto flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "upscaled" ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/20" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Wand2 className="h-3.5 w-3.5 animate-pulse" />
              <span>4K Output</span>
            </button>
          )}
        </div>
      </div>

      {/* 1. Master WebM Video Showcase */}
      {activeTab === "final" && videoUrl && (
        <div className="space-y-4">
          <div className="relative rounded-3xl overflow-hidden border border-neutral-700/80 bg-black shadow-2xl group flex items-center justify-center min-h-[340px]">
            <video
              src={videoUrl}
              controls
              autoPlay
              loop
              playsInline
              className="w-full h-auto max-h-[65vh] object-contain rounded-2xl"
            >
              Your browser does not support HTML5 video playback.
            </video>
            <div className="absolute top-4 left-4 bg-black/80 backdrop-blur px-3.5 py-1.5 rounded-full border border-neutral-700/80 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-400 pointer-events-none shadow-lg">
              <CheckCircle2 className="h-4 w-4 animate-pulse" />
              <span>Zero Filter Full HD Stitched Feed</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-950 p-5 rounded-3xl border border-neutral-800 shadow-inner">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 shadow-md">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-black text-white uppercase tracking-wider">Automated MediaRecorder Stitched Sequence</p>
                <p className="text-xs text-neutral-400 leading-snug">Exportable as pristine self-contained presentation showcase</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                onClick={() =>
                  handleDownload(videoUrl, `KINESIS-Master-${Date.now()}.webm`)
                }
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-sky-500/25 hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Download Master WebM</span>
              </button>

              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center h-11 w-11 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors border border-neutral-700 shadow-sm"
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 2. Foley Audio Sound Effects Showcase */}
      {activeTab === "audio" && audioUrl && (
        <div className="space-y-6 animate-fadeIn">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-purple-950/40 via-neutral-900 to-neutral-900 p-6 rounded-3xl border border-purple-500/30 shadow-xl">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500 text-white shadow-lg shadow-purple-500/25">
                <Volume2 className="h-6 w-6 animate-bounce" />
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-purple-400">Cinematic Sound Deliverable</span>
                <h4 className="text-xl font-black text-white">AI Sound Effects (Foley) Ready</h4>
              </div>
            </div>

            <button
              onClick={() => handleDownload(audioUrl, `KINESIS-Foley-${Date.now()}.mp3`)}
              className="px-6 py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-purple-600/20 cursor-pointer flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              <span>Download MP3 Audio</span>
            </button>
          </div>

          <div className="p-6 rounded-3xl bg-neutral-950 border border-neutral-800 space-y-3">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Preview Audio Direct</p>
            <audio src={audioUrl} controls className="w-full" />
            <p className="text-xs text-neutral-500 leading-relaxed font-medium">
              You can import this cinematic Foley sound file directly into your video editing timeline (e.g. Premiere Pro, DaVinci Resolve, or CapCut) underneath your master WebM feed.
            </p>
          </div>
        </div>
      )}

      {/* 3. 4K Video Upscaling Showcase */}
      {activeTab === "upscaled" && upscaledUrl && (
        <div className="space-y-6 animate-fadeIn">
          <div className="relative rounded-3xl overflow-hidden border border-emerald-500/50 bg-black shadow-2xl group flex items-center justify-center min-h-[340px]">
            <video
              src={upscaledUrl}
              controls
              autoPlay
              loop
              playsInline
              className="w-full h-auto max-h-[65vh] object-contain rounded-2xl"
            />
            <div className="absolute top-4 left-4 bg-black/80 backdrop-blur px-3.5 py-1.5 rounded-full border border-emerald-500 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-400 pointer-events-none shadow-lg">
              <Sparkles className="h-4 w-4 animate-spin text-emerald-400" />
              <span>4K / 60fps AI Video Upscaling Master</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-950 p-5 rounded-3xl border border-neutral-800 shadow-inner">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0 shadow-md">
                <Wand2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-black text-white uppercase tracking-wider">Topaz-Grade Detail Interpolation</p>
                <p className="text-xs text-neutral-400 leading-snug">Double spatial resolution with high-fidelity detail synthesis</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                onClick={() =>
                  handleDownload(upscaledUrl, `KINESIS-4K-Master-${Date.now()}.mp4`)
                }
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-emerald-600/25 active:scale-[0.99] transition-all cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Download 4K WebM/MP4</span>
              </button>

              <a
                href={upscaledUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center h-11 w-11 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition-colors border border-neutral-700 shadow-sm"
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 4. Grid of Individual Intermediate Slices */}
      {(activeTab === "segments" || (!videoUrl && completedSegments.length > 0)) && (
        <div className="space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-neutral-400 uppercase tracking-widest">
              Chained Multi-Clip Slices Vault
            </span>
            <span className="text-xs font-medium text-neutral-500">
              Each raw segment auto-rendered from prior keyframe anchor
            </span>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {completedSegments.map((seg: VideoSegment) => (
              <div
                key={seg.id}
                className="flex flex-col justify-between p-5 rounded-3xl bg-neutral-950 border border-neutral-800/80 hover:border-neutral-700 transition-all shadow-xl group space-y-3.5"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      Slice #{seg.index + 1}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-black">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{seg.params.durationSeconds}s Slice</span>
                    </span>
                  </div>

                  <div className="relative rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800 aspect-video flex items-center justify-center shadow-inner">
                    <video
                      src={seg.videoUrl!}
                      controls
                      playsInline
                      className="w-full h-full object-contain bg-black"
                    />
                  </div>

                  <div className="p-3 rounded-2xl bg-neutral-900/60 font-mono text-[11px] font-medium text-neutral-300 line-clamp-2 leading-relaxed border border-neutral-800/50">
                    {seg.params.prompt || "No prompt text provided"}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-neutral-800/80">
                  <button
                    onClick={() =>
                      handleDownload(
                        seg.videoUrl!,
                        `KINESIS-Slice-${seg.index + 1}-${Date.now()}.mp4`
                      )
                    }
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-neutral-800 hover:bg-sky-500 hover:text-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-neutral-200 transition-all cursor-pointer"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download MP4 Chunk</span>
                  </button>

                  <a
                    href={seg.videoUrl!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center h-10 w-10 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors border border-neutral-700"
                    title="View file direct"
                  >
                    <Eye className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
