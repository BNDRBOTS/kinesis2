import type { FeatureSwitches } from "../types";
import { Sliders, Sparkles, Volume2, Video, Layers, Lock, Wand2 } from "lucide-react";

interface Props {
  switches: FeatureSwitches;
  onChange: (switches: FeatureSwitches) => void;
}

export default function FeatureSwitchBar({ switches, onChange }: Props) {
  const toggle = (key: keyof FeatureSwitches) => {
    onChange({
      ...switches,
      [key]: !switches[key],
    });
  };

  return (
    <div className="space-y-4 rounded-3xl border border-neutral-800 bg-neutral-900/90 p-6 sm:p-7 shadow-2xl backdrop-blur font-sans">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Sliders className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Pipeline Features & Switches</h3>
            <p className="text-xs text-neutral-400">Tailor automation, upscaling, sound effects, and gate access</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-neutral-800 text-[10px] font-bold text-neutral-300 border border-neutral-700">
          Fully Active
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {/* Toggle 1: Auto-Stitch */}
        <div
          onClick={() => toggle("autoStitch")}
          className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
            switches.autoStitch
              ? "bg-sky-500/10 border-sky-500/40 text-white shadow-lg shadow-sky-500/5"
              : "bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <Video className={`h-4 w-4 ${switches.autoStitch ? "text-sky-400" : "text-neutral-500"}`} />
            <div>
              <p className="text-xs font-bold">Auto-Stitch Sequence</p>
              <p className="text-[10px] opacity-75">Concatenate slices to WebM</p>
            </div>
          </div>
          <div className={`h-5 w-9 rounded-full transition-colors p-0.5 ${switches.autoStitch ? "bg-sky-500" : "bg-neutral-800"}`}>
            <div className={`h-4 w-4 rounded-full bg-white transition-transform ${switches.autoStitch ? "translate-x-4" : "translate-x-0"}`} />
          </div>
        </div>

        {/* Toggle 2: Foley Audio Sound Effects */}
        <div className={`flex flex-col justify-between p-3.5 rounded-2xl border transition-all ${
          switches.generateFoleyAudio
            ? "bg-purple-500/10 border-purple-500/40 text-white shadow-lg shadow-purple-500/5"
            : "bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
        }`}>
          <div
            onClick={() => toggle("generateFoleyAudio")}
            className="flex items-center justify-between cursor-pointer pb-2"
          >
            <div className="flex items-center gap-3">
              <Volume2 className={`h-4 w-4 ${switches.generateFoleyAudio ? "text-purple-400" : "text-neutral-500"}`} />
              <div>
                <p className="text-xs font-bold">Add Sound Effects (Foley)</p>
                <p className="text-[10px] opacity-75">Generate audio matching action</p>
              </div>
            </div>
            <div className={`h-5 w-9 rounded-full transition-colors p-0.5 ${switches.generateFoleyAudio ? "bg-purple-500" : "bg-neutral-800"}`}>
              <div className={`h-4 w-4 rounded-full bg-white transition-transform ${switches.generateFoleyAudio ? "translate-x-4" : "translate-x-0"}`} />
            </div>
          </div>

          {switches.generateFoleyAudio && (
            <div className="pt-2 border-t border-purple-500/20">
              <input
                type="text"
                value={switches.foleyPrompt}
                onChange={(e) => onChange({ ...switches, foleyPrompt: e.target.value })}
                placeholder="Audio prompt (e.g. footsteps, rain, cinematic whoosh)..."
                className="w-full rounded-xl bg-neutral-950 px-3 py-1.5 text-xs text-white placeholder-neutral-500 border border-purple-500/30 focus:outline-none focus:border-purple-400"
              />
            </div>
          )}
        </div>

        {/* Toggle 3: 4K Video Upscaling */}
        <div
          onClick={() => toggle("aiUpscaleFinal")}
          className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
            switches.aiUpscaleFinal
              ? "bg-emerald-500/10 border-emerald-500/40 text-white shadow-lg shadow-emerald-500/5"
              : "bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <Sparkles className={`h-4 w-4 ${switches.aiUpscaleFinal ? "text-emerald-400" : "text-neutral-500"}`} />
            <div>
              <p className="text-xs font-bold">4K / 60fps AI Video Upscaling</p>
              <p className="text-[10px] opacity-75">Enhance final output resolution</p>
            </div>
          </div>
          <div className={`h-5 w-9 rounded-full transition-colors p-0.5 ${switches.aiUpscaleFinal ? "bg-emerald-500" : "bg-neutral-800"}`}>
            <div className={`h-4 w-4 rounded-full bg-white transition-transform ${switches.aiUpscaleFinal ? "translate-x-4" : "translate-x-0"}`} />
          </div>
        </div>

        {/* Toggle 4: AI Prompt Enhancer */}
        <div
          onClick={() => toggle("autoEnhancePrompt")}
          className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
            switches.autoEnhancePrompt
              ? "bg-amber-500/10 border-amber-500/40 text-white shadow-lg shadow-amber-500/5"
              : "bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <Wand2 className={`h-4 w-4 ${switches.autoEnhancePrompt ? "text-amber-400" : "text-neutral-500"}`} />
            <div>
              <p className="text-xs font-bold">Cinematic Prompt Polish</p>
              <p className="text-[10px] opacity-75">Flesh out lighting & lens specs</p>
            </div>
          </div>
          <div className={`h-5 w-9 rounded-full transition-colors p-0.5 ${switches.autoEnhancePrompt ? "bg-amber-500" : "bg-neutral-800"}`}>
            <div className={`h-4 w-4 rounded-full bg-white transition-transform ${switches.autoEnhancePrompt ? "translate-x-4" : "translate-x-0"}`} />
          </div>
        </div>

        {/* Toggle 5: Keep Raw Slices */}
        <div
          onClick={() => toggle("keepIntermediateSlices")}
          className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
            switches.keepIntermediateSlices
              ? "bg-blue-500/10 border-blue-500/40 text-white shadow-lg shadow-blue-500/5"
              : "bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <Layers className={`h-4 w-4 ${switches.keepIntermediateSlices ? "text-blue-400" : "text-neutral-500"}`} />
            <div>
              <p className="text-xs font-bold">Keep Raw Slices</p>
              <p className="text-[10px] opacity-75">Preserve per-segment MP4s</p>
            </div>
          </div>
          <div className={`h-5 w-9 rounded-full transition-colors p-0.5 ${switches.keepIntermediateSlices ? "bg-blue-500" : "bg-neutral-800"}`}>
            <div className={`h-4 w-4 rounded-full bg-white transition-transform ${switches.keepIntermediateSlices ? "translate-x-4" : "translate-x-0"}`} />
          </div>
        </div>

        {/* Toggle 6: Gumroad License Gate */}
        <div
          onClick={() => toggle("enableGumroadGate")}
          className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
            switches.enableGumroadGate
              ? "bg-indigo-500/10 border-indigo-500/40 text-white shadow-lg shadow-indigo-500/5"
              : "bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <Lock className={`h-4 w-4 ${switches.enableGumroadGate ? "text-indigo-400" : "text-neutral-500"}`} />
            <div>
              <p className="text-xs font-bold">Gumroad Auth Gate</p>
              <p className="text-[10px] opacity-75">Require key for portal access</p>
            </div>
          </div>
          <div className={`h-5 w-9 rounded-full transition-colors p-0.5 ${switches.enableGumroadGate ? "bg-indigo-500" : "bg-neutral-800"}`}>
            <div className={`h-4 w-4 rounded-full bg-white transition-transform ${switches.enableGumroadGate ? "translate-x-4" : "translate-x-0"}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
