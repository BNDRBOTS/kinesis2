import { useState, useCallback, useRef } from "react";
import { fileToDataUrl } from "../api/helpers";
import { UploadCloud, Image as ImageIcon, X, Clipboard, Sparkles } from "lucide-react";

interface Props {
  imageUrl: string | null;
  onImageChange: (dataUrl: string) => void;
}

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16 MB
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ImageUploader({ imageUrl, onImageChange }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("Unsupported format. Please upload a JPEG, PNG, or WebP image.");
        return;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError("File exceeds 16 MB limit. Please select a smaller keyframe.");
        return;
      }

      try {
        const dataUrl = await fileToDataUrl(file);
        onImageChange(dataUrl);
      } catch {
        setError("Failed to read the image file. Please try again.");
      }
    },
    [onImageChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = "";
    },
    [processFile]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            processFile(file);
            break;
          }
        }
      }
    },
    [processFile]
  );

  const handleSampleClick = (e: React.MouseEvent, sampleUrl: string) => {
    e.stopPropagation();
    onImageChange(sampleUrl);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-400">
          <ImageIcon className="h-4 w-4 text-sky-400" />
          <span>Source First Frame Image</span>
        </label>
        {imageUrl && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onImageChange("");
              setError(null);
            }}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20"
          >
            <X className="h-3 w-3" />
            <span>Remove Frame</span>
          </button>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onPaste={handlePaste}
        onClick={() => inputRef.current?.click()}
        tabIndex={0}
        role="button"
        aria-label="Upload an image"
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all group ${
          dragOver
            ? "border-sky-500 bg-sky-500/10 scale-[1.01]"
            : "border-neutral-700 bg-neutral-900/80 hover:border-sky-500/50 hover:bg-neutral-900"
        } ${imageUrl ? "min-h-[260px] p-2" : "h-56 p-6"}`}
      >
        {imageUrl ? (
          <div className="relative flex items-center justify-center w-full h-full rounded-xl overflow-hidden bg-black/60 group-hover:ring-2 group-hover:ring-sky-500/40 transition-all">
            <img
              src={imageUrl}
              alt="Uploaded source"
              className="max-h-72 w-auto object-contain rounded-lg shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
              <span className="flex items-center gap-2 text-xs font-semibold text-white bg-black/80 backdrop-blur px-3 py-1.5 rounded-full border border-neutral-700">
                <UploadCloud className="h-4 w-4 text-sky-400" />
                <span>Click or drop to replace keyframe image</span>
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center max-w-md">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800 text-sky-400 group-hover:bg-sky-500 group-hover:text-white transition-all duration-300 shadow-lg mb-3">
              <UploadCloud className="h-7 w-7 transition-transform group-hover:scale-110" />
            </div>
            <p className="text-sm font-semibold text-white group-hover:text-sky-300 transition-colors">
              Drop image here, click to browse, or paste from clipboard
            </p>
            <div className="flex items-center justify-center gap-3 mt-2 text-xs text-neutral-500">
              <span>JPEG, PNG, WebP</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Clipboard className="h-3 w-3" />
                <span>Supports `Ctrl+V`</span>
              </span>
              <span>•</span>
              <span>Max 16 MB</span>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-400">
          ⚠️ {error}
        </div>
      )}

      {!imageUrl && (
        <div className="flex items-center justify-between bg-neutral-950 p-2.5 rounded-xl border border-neutral-800/80">
          <span className="flex items-center gap-1.5 text-xs text-neutral-400">
            <Sparkles className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span>No image ready? Try a premium stock keyframe:</span>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {[
              { label: "Cyberpunk", url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80" },
              { label: "Majestic Peaks", url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80" },
              { label: "Neon City", url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80" },
            ].map((sample, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => handleSampleClick(e, sample.url)}
                className="text-[11px] font-medium bg-neutral-800 hover:bg-sky-500 hover:text-white text-neutral-300 px-2 py-1 rounded-lg border border-neutral-700/60 transition-all"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
