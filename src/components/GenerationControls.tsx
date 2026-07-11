import { useMemo, useCallback } from "react";
import type { ModelDescriptor, ApiKeys, Preset } from "../types";
import { MODEL_REGISTRY, MOCK_CREATOR_PRESETS } from "../constants";
import { Sparkles, Sliders, Cpu, AlignLeft, ShieldOff, Clock, Film, Hash, Gauge, Wand2 } from "lucide-react";

export interface GenerationSettings {
  selectedModelId: string;
  prompt: string;
  negativePrompt: string;
  durationPerClip: number;
  aspectRatio: string;
  seed: string;
  cfgScale: number;
  targetTotalDuration: number;
}

interface Props {
  settings: GenerationSettings;
  onChange: (settings: GenerationSettings) => void;
  apiKeys: ApiKeys;
  onSelectPreset?: (preset: Preset) => void;
}

export default function GenerationControls({
  settings,
  onChange,
  apiKeys,
  onSelectPreset,
}: Props) {
  const availableModels: ModelDescriptor[] = useMemo(() => {
    const hasAnyKey = Object.values(apiKeys).some(Boolean);
    if (!hasAnyKey) return MODEL_REGISTRY;
    return MODEL_REGISTRY.filter((m) => {
      const key = apiKeys[m.provider];
      return Boolean(key);
    });
  }, [apiKeys]);
  
  const selectedModel = useMemo(
    () =>
      MODEL_REGISTRY.find((m) => m.id === settings.selectedModelId) ||
      MODEL_REGISTRY[0],
    [settings.selectedModelId]
  );
  
  const update = useCallback(
    (partial: Partial<GenerationSettings>) => {
      onChange({ ...settings, ...partial });
    },
    [settings, onChange]
  );
  
  const segmentCount = useMemo(() => {
    const max = selectedModel.maxDurationSeconds;
    return Math.ceil(settings.targetTotalDuration / max);
  }, [selectedModel, settings.targetTotalDuration]);
  
  const handleApplyPreset = (preset: Preset) => {
    if (onSelectPreset) {
      onSelectPreset(preset);
    } else {
      update({
        prompt: preset.prompt,
        negativePrompt: preset.negativePrompt,
        durationPerClip: preset.durationSeconds,
        aspectRatio: preset.aspectRatio,
        cfgScale: preset.cfgScale,
      });
    }
  };

  const handleEnhancePrompt = () => {
    if (!settings.prompt.trim()) {
      update({
        prompt: "Cinematic establishing shot, pristine anamorphic lens, 8k photorealistic resolution, dynamic volumetric lighting during golden hour, subtle atmospheric haze, slow buttery smooth camera tracking right, masterfully composed.",
      });
      return;
    }

    const modifiers = [
      "8k pristine photorealistic resolution",
      "shot on anamorphic 35mm lens with beautiful edge flares",
      "masterfully orchestrated cinematic volumetric lighting",
      "slow buttery smooth camera tracking and delicate push-in",
      "rich deep contrast and subtle film grain",
      "award-winning color grading tailored for big screen showcase"
    ];

    update({
      prompt: `${settings.prompt.trim()}, ${modifiers.join(", ")}.`,
    });
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Creative Presets Hub */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-sky-400">
            <Sparkles className="h-4 w-4" />
            <span>Creative Style Hub</span>
          </span>
          <span className="text-[11px] text-neutral-500 font-medium">Instantly populate parameters</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {MOCK_CREATOR_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => handleApplyPreset(preset)}
              className="group relative flex flex-col items-start p-3 rounded-2xl border border-neutral-800 bg-neutral-950/60 hover:bg-sky-950/30 hover:border-sky-500/50 text-left transition-all shadow-sm overflow-hidden cursor-pointer"
            >
              <div className="absolute top-0 right-0 h-14 w-14 bg-gradient-to-bl from-sky-500/10 to-transparent rounded-bl-full pointer-events-none" />
              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-neutral-800 text-neutral-400 group-hover:bg-sky-500/20 group-hover:text-sky-300 transition-colors mb-1.5">
                {preset.category}
              </span>
              <span className="text-xs font-black text-white group-hover:text-sky-200 transition-colors line-clamp-1 leading-snug">
                {preset.title}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-neutral-800 w-full" />

      {/* Model Selection */}
      <div className="space-y-2">
        <label
          htmlFor="model-select"
          className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-neutral-300"
        >
          <Cpu className="h-4 w-4 text-sky-400" />
          <span>AI Generator Model</span>
        </label>
        <select
          id="model-select"
          value={settings.selectedModelId}
          onChange={(e) => {
            const model = MODEL_REGISTRY.find((m) => m.id === e.target.value);
            if (model) {
              update({
                selectedModelId: model.id,
                durationPerClip: Math.min(
                  settings.durationPerClip,
                  model.maxDurationSeconds
                ),
                aspectRatio: model.aspectRatios.includes(settings.aspectRatio)
                  ? settings.aspectRatio
                  : model.aspectRatios[0],
              });
            }
          }}
          className="block w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3.5 text-sm font-black text-white shadow-inner focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-all cursor-pointer"
        >
          {availableModels.map((m) => (
            <option key={m.id} value={m.id} className="bg-neutral-950 text-white py-1 font-bold">
              {m.label} ({m.maxDurationSeconds}s max / clip)
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-400 bg-neutral-950 p-3 rounded-xl border border-neutral-800/80 leading-relaxed font-medium">
          💡 <span className="text-neutral-300">{selectedModel.note}</span>
        </p>
      </div>

      {/* Prompt Configuration */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label
            htmlFor="prompt"
            className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-neutral-300"
          >
            <AlignLeft className="h-4 w-4 text-sky-400" />
            <span>Cinematic Prompt</span>
          </label>
          <div className="flex items-center justify-between sm:justify-end gap-3">
            <button
              type="button"
              onClick={handleEnhancePrompt}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-bold transition-all cursor-pointer"
            >
              <Wand2 className="h-3 w-3" />
              <span>AI Prompt Polish</span>
            </button>
            <span className="text-[10px] text-neutral-500 font-mono font-semibold">{settings.prompt.length} / 1000 chars</span>
          </div>
        </div>
        <textarea
          id="prompt"
          rows={4}
          value={settings.prompt}
          onChange={(e) => update({ prompt: e.target.value })}
          placeholder="Describe camera movement (e.g. slow cinematic pan right), atmospheric details, cinematic lighting, and subject action..."
          className="block w-full resize-y rounded-2xl border border-neutral-700 bg-neutral-950 p-4 text-sm text-neutral-100 placeholder-neutral-600 shadow-inner focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-all leading-relaxed font-medium"
        />
      </div>

      {/* Negative Prompt */}
      {selectedModel.supportsNegativePrompt && (
        <div className="space-y-2">
          <label
            htmlFor="neg-prompt"
            className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-neutral-300"
          >
            <ShieldOff className="h-4 w-4 text-red-400" />
            <span>Negative Prompt (Avoid)</span>
          </label>
          <input
            id="neg-prompt"
            type="text"
            value={settings.negativePrompt}
            onChange={(e) => update({ negativePrompt: e.target.value })}
            placeholder="blur, distort, low quality, watermark, artificial, bad anatomy"
            className="block w-full rounded-2xl border border-neutral-700 bg-neutral-950 px-4 py-3.5 text-sm font-medium text-neutral-100 placeholder-neutral-600 shadow-inner focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-all"
          />
        </div>
      )}

      {/* Grid of Sliders and Parameters */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1.5 p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800">
          <label
            htmlFor="clip-dur"
            className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-neutral-400"
          >
            <Clock className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span>Clip Length</span>
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="clip-dur"
              type="number"
              min={1}
              max={selectedModel.maxDurationSeconds}
              step={1}
              value={settings.durationPerClip}
              onChange={(e) =>
                update({
                  durationPerClip: Math.max(
                    1,
                    Math.min(
                      selectedModel.maxDurationSeconds,
                      Number(e.target.value) || 5
                    )
                  ),
                })
              }
              className="block w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-black text-white focus:border-sky-500 focus:outline-none text-center"
            />
            <span className="text-xs font-bold text-neutral-500">s</span>
          </div>
          <p className="text-[10px] text-neutral-500 font-semibold">Max {selectedModel.maxDurationSeconds}s</p>
        </div>

        <div className="space-y-1.5 p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800">
          <label
            htmlFor="aspect"
            className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-neutral-400"
          >
            <Film className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span>Output Ratio</span>
          </label>
          <select
            id="aspect"
            value={settings.aspectRatio}
            onChange={(e) => update({ aspectRatio: e.target.value })}
            className="block w-full rounded-xl border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-sm font-black text-white focus:border-sky-500 focus:outline-none cursor-pointer"
          >
            {selectedModel.aspectRatios.map((r) => (
              <option key={r} value={r}>
                {r === "16:9" ? "16:9 (Landscape)" : r === "9:16" ? "9:16 (Vertical)" : "1:1 (Square)"}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-neutral-500 font-semibold">Frame layout</p>
        </div>

        <div className="space-y-1.5 p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800">
          <label
            htmlFor="seed"
            className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-neutral-400"
          >
            <Hash className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span>Seed</span>
          </label>
          <input
            id="seed"
            type="text"
            value={settings.seed}
            onChange={(e) => update({ seed: e.target.value })}
            placeholder="Random"
            disabled={!selectedModel.supportsSeed}
            className="block w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm font-black text-white placeholder-neutral-600 focus:border-sky-500 focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed font-mono text-center"
          />
          <p className="text-[10px] text-neutral-500 font-semibold line-clamp-1">
            {selectedModel.supportsSeed ? "Consistency anchor" : "Not available"}
          </p>
        </div>

        <div className="space-y-1.5 p-3.5 rounded-2xl bg-neutral-950 border border-neutral-800">
          <label
            htmlFor="cfg"
            className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-neutral-400"
          >
            <Gauge className="h-3.5 w-3.5 text-sky-400 shrink-0" />
            <span>CFG Scale</span>
          </label>
          <div className="flex items-center gap-1">
            <input
              id="cfg"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={settings.cfgScale}
              onChange={(e) =>
                update({
                  cfgScale: Math.max(
                    0,
                    Math.min(1, Number(e.target.value) || 0.5)
                  ),
                })
              }
              className="block w-full rounded-xl border border-neutral-700 bg-neutral-900 px-2 py-2 text-sm font-black text-white focus:border-sky-500 focus:outline-none text-center"
            />
          </div>
          <p className="text-[10px] text-neutral-500 font-semibold">Guidance match</p>
        </div>
      </div>

      {/* Target Total Duration Orchestrator */}
      <div className="space-y-3.5 p-5 rounded-3xl bg-gradient-to-br from-neutral-950 via-neutral-950 to-sky-950/40 border border-sky-500/30 shadow-2xl">
        <div className="flex items-center justify-between">
          <label
            htmlFor="total-dur"
            className="flex items-center gap-2.5 text-xs font-black uppercase tracking-wider text-white"
          >
            <Sliders className="h-4 w-4 text-sky-400" />
            <span>Automated Multi-Clip Sequence Duration</span>
          </label>
          <span className="px-3.5 py-1.5 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white text-xs font-black shadow-lg shadow-sky-500/20">
            {settings.targetTotalDuration} Seconds
          </span>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <input
            id="total-dur-range"
            type="range"
            min={5}
            max={60}
            step={5}
            value={settings.targetTotalDuration}
            onChange={(e) => update({ targetTotalDuration: Number(e.target.value) || 15 })}
            className="w-full accent-sky-500 h-2.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pt-1">
          <div className="flex items-center gap-2 text-xs text-neutral-400 font-medium">
            <span className="inline-block h-2 w-2 rounded-full bg-sky-400" />
            <span>
              Auto-chaining into <strong>{segmentCount} dynamic slice{segmentCount !== 1 ? "s" : ""}</strong> ({settings.durationPerClip}s each)
            </span>
          </div>
          <span className="text-[11px] text-sky-300 font-bold tracking-wide">
            Seamless Canvas WebM Stitched Feed
          </span>
        </div>
      </div>
    </div>
  );
}
