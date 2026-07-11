import { useState } from "react";
import type { CreationHistoryItem } from "../types";
import { History, Film, Eye, Trash2, Calendar, Clock, Layers, Sparkles, Volume2, Archive } from "lucide-react";
import JSZip from "jszip";

interface Props {
  items: CreationHistoryItem[];
  onLoadSession: (item: CreationHistoryItem) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
}

export default function CreationHistoryGallery({ items, onLoadSession, onDeleteItem, onClearAll }: Props) {
  const [selectedItem, setSelectedItem] = useState<CreationHistoryItem | null>(null);
  const [downloadingZip, setDownloadingZip] = useState<string | null>(null);

  const handleDownloadZipManifest = async (item: CreationHistoryItem) => {
    setDownloadingZip(item.id);
    try {
      const zip = new JSZip();
      
      // Manifest JSON
      const manifest = {
        title: item.title,
        timestamp: new Date(item.timestamp).toISOString(),
        prompt: item.prompt,
        negativePrompt: item.negativePrompt,
        model: item.modelLabel,
        targetDurationSeconds: item.targetDurationSeconds,
        aspectRatio: item.aspectRatio,
        masterVideoUrl: item.stitchedUrl,
        foleyAudioUrl: item.audioUrl,
        upscaledVideoUrl: item.upscaledUrl,
        segmentsCount: item.segments.length,
      };
      zip.file("execution_manifest.json", JSON.stringify(manifest, null, 2));

      // Download and attach master video if hosted
      if (item.stitchedUrl && (item.stitchedUrl.startsWith("http") || item.stitchedUrl.startsWith("blob:"))) {
        try {
          const res = await fetch(item.stitchedUrl);
          const blob = await res.blob();
          zip.file("master_output.mp4", blob);
        } catch {
          // ignore CORS errors
        }
      }

      // Download and attach Foley Audio if available
      if (item.audioUrl && item.audioUrl.startsWith("http")) {
        try {
          const res = await fetch(item.audioUrl);
          const blob = await res.blob();
          zip.file("cinematic_foley.mp3", blob);
        } catch {
          // ignore CORS errors
        }
      }

      // Download intermediate slices
      const slicesFolder = zip.folder("raw_slices");
      if (slicesFolder) {
        for (const [idx, seg] of item.segments.entries()) {
          if (seg.videoUrl && seg.status === "succeeded") {
            try {
              const res = await fetch(seg.videoUrl);
              const blob = await res.blob();
              slicesFolder.file(`slice_${idx + 1}.mp4`, blob);
            } catch {
              // ignore CORS errors
            }
          }
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = zipUrl;
      a.download = `KINESIS_Archive_${item.id.slice(0, 6)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 8000);
    } catch (err) {
      console.error("Failed to generate zip manifest:", err);
      alert("Could not build full zip archive due to network restrictions. You can download individual files.");
    } finally {
      setDownloadingZip(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-3xl bg-neutral-900/60 border border-neutral-800 space-y-3 font-sans">
        <History className="h-10 w-10 text-neutral-600" />
        <p className="text-sm font-bold text-neutral-400 uppercase tracking-wider">No Creation History Yet</p>
        <p className="text-xs text-neutral-500 max-w-sm">
          Sessions you successfully generate or orchestrate will be automatically preserved here in your browser's local storage.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <History className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Local Creator Vault & Gallery</h3>
            <p className="text-xs text-neutral-400">Preserved sessions ({items.length}) • Fully restore or download bundles</p>
          </div>
        </div>

        <button
          onClick={() => {
            if (confirm("Are you sure you want to clear all preserved creation history items?")) {
              onClearAll();
            }
          }}
          className="px-3 py-1.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold hover:bg-red-500/20 transition-all cursor-pointer flex items-center gap-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Clear Vault</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((item) => {
          const isSelected = selectedItem?.id === item.id;
          const successfulSegments = item.segments.filter((s) => s.status === "succeeded");

          return (
            <div
              key={item.id}
              className={`flex flex-col justify-between p-5 rounded-3xl border transition-all ${
                isSelected ? "bg-neutral-900 border-sky-500/50 shadow-2xl shadow-sky-500/10" : "bg-neutral-900/80 border-neutral-800 hover:border-neutral-700"
              } space-y-4`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-neutral-800 text-sky-400 border border-neutral-700">
                      {item.modelLabel}
                    </span>
                    <h4 className="text-base font-black text-white line-clamp-1 mt-1">{item.title}</h4>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onDeleteItem(item.id)}
                      className="p-1.5 rounded-lg bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-300 transition-colors"
                      title="Delete entry"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400 bg-neutral-950 p-2.5 rounded-2xl border border-neutral-800/80">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-sky-400" />
                    <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-sky-400" />
                    <span>{item.targetDurationSeconds}s Sequence</span>
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5 text-sky-400" />
                    <span>{successfulSegments.length} Slices</span>
                  </span>
                </div>

                {/* Master Thumbnail / Preview */}
                <div
                  onClick={() => setSelectedItem(isSelected ? null : item)}
                  className="relative rounded-2xl overflow-hidden bg-black border border-neutral-800 aspect-video flex items-center justify-center group cursor-pointer"
                >
                  {item.stitchedUrl || successfulSegments[0]?.videoUrl ? (
                    <video
                      src={item.stitchedUrl || successfulSegments[0]?.videoUrl || ""}
                      controls={isSelected}
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Film className="h-8 w-8 text-neutral-600" />
                  )}

                  {!isSelected && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-white bg-black/80 backdrop-blur px-3 py-1.5 rounded-full border border-neutral-700">
                        <Eye className="h-4 w-4 text-sky-400" />
                        <span>Inspect Sequence Feed</span>
                      </span>
                    </div>
                  )}
                </div>

                <div className="font-mono text-[11px] text-neutral-400 bg-neutral-950/60 p-2.5 rounded-xl border border-neutral-800/60 line-clamp-2">
                  <strong>Prompt:</strong> {item.prompt}
                </div>

                {/* Feature Tags showing if upscaled or audio ready */}
                {(item.audioUrl || item.upscaledUrl) && (
                  <div className="flex items-center gap-2 pt-1">
                    {item.audioUrl && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                        <Volume2 className="h-3 w-3 text-purple-400" />
                        <span>Foley Ready</span>
                      </span>
                    )}
                    {item.upscaledUrl && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <Sparkles className="h-3 w-3 text-emerald-400" />
                        <span>4K Upscaled</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center gap-2 pt-2 border-t border-neutral-800/80">
                <button
                  onClick={() => onLoadSession(item)}
                  className="flex-1 px-4 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all shadow-lg shadow-sky-600/20 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Film className="h-3.5 w-3.5" />
                  <span>Reload Session to Studio</span>
                </button>

                <button
                  onClick={() => handleDownloadZipManifest(item)}
                  disabled={downloadingZip === item.id}
                  className="px-3.5 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold transition-all border border-neutral-700/80 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  title="Download Zip Package (Manifest + MP4s + MP3)"
                >
                  <Archive className="h-4 w-4 text-sky-400" />
                  <span>{downloadingZip === item.id ? "Packing..." : "Zip Bundle"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
