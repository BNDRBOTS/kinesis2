import { useState, useMemo, useCallback } from "react";
import type { ApiKeys, Preset, FeatureSwitches, CreationHistoryItem } from "./types";
import {
  LS_KEY_API_KEYS,
  LS_KEY_FEATURE_SWITCHES,
  LS_KEY_CREATION_HISTORY,
  DEFAULT_PROMPT,
  DEFAULT_NEGATIVE_PROMPT,
  DEFAULT_DURATION_SECONDS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_CFG_SCALE,
  DEFAULT_TARGET_DURATION,
  MODEL_REGISTRY,
} from "./constants";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { usePipeline } from "./hooks/usePipeline";

import ApiKeyManager from "./components/ApiKeyManager";
import GenerationControls, { GenerationSettings } from "./components/GenerationControls";
import ImageUploader from "./components/ImageUploader";
import PipelineStatus from "./components/PipelineStatus";
import VideoPlayer from "./components/VideoPlayer";
import GumroadGate from "./components/GumroadGate";
import FeatureSwitchBar from "./components/FeatureSwitchBar";
import CreationHistoryGallery from "./components/CreationHistoryGallery";
import { Video, Play, Square, Layers, RefreshCw, Cpu, HelpCircle, ShieldCheck, Sliders, Sparkles } from "lucide-react";

const INITIAL_API_KEYS: ApiKeys = {
  comfyui: "",
  fal: "",
  replicate: "",
  runway: "",
  luma: "",
};

const INITIAL_SWITCHES: FeatureSwitches = {
  enableGumroadGate: true,
  gumroadProductId: "kinesis_pro_studio",
  autoStitch: true,
  keepIntermediateSlices: true,
  autoEnhancePrompt: false,
  generateFoleyAudio: false,
  foleyPrompt: "",
  aiUpscaleFinal: false,
};

function MainStudioFeed() {
  const [apiKeys, setApiKeys] = useLocalStorage<ApiKeys>(LS_KEY_API_KEYS, INITIAL_API_KEYS);
  const [switches, setSwitches] = useLocalStorage<FeatureSwitches>(LS_KEY_FEATURE_SWITCHES, INITIAL_SWITCHES);
  const [history, setHistory] = useLocalStorage<CreationHistoryItem[]>(LS_KEY_CREATION_HISTORY, []);
  
  const [sourceImageUrl, setSourceImageUrl] = useState<string>("");
  const [activePortalTab, setActivePortalTab] = useState<"feed" | "switches" | "vault" | "docs">("feed");

  const [settings, setSettings] = useState<GenerationSettings>({
    selectedModelId: MODEL_REGISTRY[0].id,
    prompt: DEFAULT_PROMPT,
    negativePrompt: DEFAULT_NEGATIVE_PROMPT,
    durationPerClip: DEFAULT_DURATION_SECONDS,
    aspectRatio: DEFAULT_ASPECT_RATIO,
    seed: "",
    cfgScale: DEFAULT_CFG_SCALE,
    targetTotalDuration: DEFAULT_TARGET_DURATION,
  });

  const { pipelineState, activeLogs, startPipeline, cancelPipeline } = usePipeline(apiKeys);

  const canGenerate = useMemo(() => {
    const hasImage = !!sourceImageUrl;
    const hasModel = !!settings.selectedModelId;
    const modelDef = MODEL_REGISTRY.find((m) => m.id === settings.selectedModelId);
    
    if (!modelDef) return false;
    
    const hasRequiredKey = !!apiKeys[modelDef.provider];
    
    return hasImage && hasModel && hasRequiredKey && pipelineState.status !== "generating" && pipelineState.status !== "stitching";
  }, [sourceImageUrl, settings.selectedModelId, apiKeys, pipelineState.status]);

  const handleStartExecution = () => {
    const modelDef = MODEL_REGISTRY.find((m) => m.id === settings.selectedModelId);
    if (!modelDef) return;

    // Apply autoEnhancePrompt modifier if enabled
    let finalPromptToUse = settings.prompt.trim();
    if (switches.autoEnhancePrompt && finalPromptToUse) {
      const cinematicAdditions = "8k photorealistic masterpiece, shot on anamorphic lens, award-winning cinematic volumetric lighting, buttery smooth tracking";
      if (!finalPromptToUse.includes("anamorphic")) {
        finalPromptToUse = `${finalPromptToUse}, ${cinematicAdditions}.`;
      }
    }

    startPipeline(
      {
        model: modelDef,
        prompt: finalPromptToUse,
        negativePrompt: settings.negativePrompt,
        durationSeconds: settings.durationPerClip,
        aspectRatio: settings.aspectRatio,
        seed: settings.seed.trim() ? parseInt(settings.seed, 10) : null,
        cfgScale: settings.cfgScale,
        imageUrl: sourceImageUrl,
      },
      settings.targetTotalDuration,
      switches,
      (newItem: CreationHistoryItem) => {
        setHistory((prev) => [newItem, ...prev]);
      }
    );
    setActivePortalTab("feed");
  };

  const handleLoadSession = useCallback((item: CreationHistoryItem) => {
    setSettings((prev) => ({
      ...prev,
      prompt: item.prompt,
      negativePrompt: item.negativePrompt,
      targetTotalDuration: item.targetDurationSeconds,
      aspectRatio: item.aspectRatio,
    }));
    setSourceImageUrl(item.segments[0]?.params.imageUrl || "");
    setActivePortalTab("feed");
  }, []);

  const handleDeleteHistoryItem = useCallback((id: string) => {
    setHistory((prev) => prev.filter((i) => i.id !== id));
  }, [setHistory]);

  const handleClearAllHistory = useCallback(() => {
    setHistory([]);
  }, [setHistory]);

  const handleSelectPreset = useCallback((preset: Preset) => {
    setSettings((prev) => ({
      ...prev,
      prompt: preset.prompt,
      negativePrompt: preset.negativePrompt,
      durationPerClip: preset.durationSeconds,
      aspectRatio: preset.aspectRatio,
      cfgScale: preset.cfgScale,
    }));
    setSourceImageUrl(preset.imageUrl);
  }, []);

  const allAggregatedLogs = useMemo(() => {
    return Object.values(activeLogs).flat();
  }, [activeLogs]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 flex flex-col font-sans selection:bg-sky-500 selection:text-white">
      {/* Top Elite Navigation Studio Header */}
      <header className="sticky top-0 z-50 border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur-xl px-4 sm:px-8 py-3.5 transition-all shadow-lg">
        <div className="mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 max-w-7xl">
          <div className="flex items-center justify-between w-full sm:w-auto">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-600 text-white shadow-lg shadow-sky-500/25">
                <Video className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black tracking-tight text-white leading-none">KINESIS</h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    Pro Feed
                  </span>
                </div>
                <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-1">
                  No Filter Video Production Suite
                </p>
              </div>
            </div>
          </div>

          {/* Portal Navigation Controller */}
          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-1.5 w-full sm:w-auto bg-neutral-900 p-1.5 rounded-2xl border border-neutral-800">
            <button
              onClick={() => setActivePortalTab("feed")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activePortalTab === "feed" ? "bg-sky-500 text-white shadow-md shadow-sky-500/20" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Video className="h-3.5 w-3.5" />
              <span>Studio Feed</span>
            </button>

            <button
              onClick={() => setActivePortalTab("switches")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activePortalTab === "switches" ? "bg-purple-600 text-white shadow-md shadow-purple-600/20" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Pipeline Switches</span>
              {(switches.generateFoleyAudio || switches.aiUpscaleFinal || switches.autoEnhancePrompt) && (
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setActivePortalTab("vault")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activePortalTab === "vault" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20" : "text-neutral-400 hover:text-white"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Creator Vault</span>
              {history.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[10px] font-bold">{history.length}</span>
              )}
            </button>

            <button
              onClick={() => setActivePortalTab("docs")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activePortalTab === "docs" ? "bg-neutral-800 text-white shadow-md border border-neutral-700" : "text-neutral-400 hover:text-white"
              }`}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span>Override Specs</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Orchestrator Feeds & Views */}
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-8 py-8 items-start">
        {activePortalTab === "docs" ? (
          <div className="space-y-8 rounded-3xl border border-neutral-800 bg-neutral-900/90 p-8 sm:p-12 shadow-2xl animate-fadeIn max-w-4xl mx-auto font-sans">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500 text-white shadow-lg shadow-sky-500/25">
                <HelpCircle className="h-7 w-7" />
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-sky-400">Production Engine Override</span>
                <h2 className="text-3xl font-black text-white">System Architecture & CORS Boundaries</h2>
              </div>
            </div>

            <div className="space-y-6 text-neutral-300 text-sm leading-relaxed font-medium">
              <p className="text-base font-bold text-white leading-snug">
                Most cutting-edge AI video generation models (like Wan 2.1, Kling, Hunyuan Video, and Runway Gen-3) impose strict duration boundaries per API request (typically 5 to 10 seconds). KINESIS completely automates continuous multi-clip extension into a unified master timeline.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                <div className="p-5 rounded-3xl bg-neutral-950 border border-neutral-800 space-y-2.5 shadow-md">
                  <span className="text-sky-400 font-black text-xs uppercase tracking-wider block">Phase 1: Auto-Splitting</span>
                  <h4 className="font-black text-white text-base">Duration Splitting</h4>
                  <p className="text-neutral-400 text-xs leading-relaxed font-normal">
                    You specify your desired final sequence length (e.g. 30 seconds). KINESIS automatically divides the target execution into optimal sequential chunks corresponding to the selected AI model's max clip boundary.
                  </p>
                </div>

                <div className="p-5 rounded-3xl bg-neutral-950 border border-neutral-800 space-y-2.5 shadow-md">
                  <span className="text-sky-400 font-black text-xs uppercase tracking-wider block">Phase 2: Ending Keyframe</span>
                  <h4 className="font-black text-white text-base">Keyframe Anchor</h4>
                  <p className="text-neutral-400 text-xs leading-relaxed font-normal">
                    As each video slice is successfully generated, KINESIS extracts its ending HTML5 video frame onto a pristine client Canvas, converts it, and injects it as the starting prompt keyframe for the subsequent video segment.
                  </p>
                </div>

                <div className="p-5 rounded-3xl bg-neutral-950 border border-neutral-800 space-y-2.5 shadow-md">
                  <span className="text-sky-400 font-black text-xs uppercase tracking-wider block">Phase 3: WebM Stream</span>
                  <h4 className="font-black text-white text-base">Canvas Stitcher</h4>
                  <p className="text-neutral-400 text-xs leading-relaxed font-normal">
                    Finally, KINESIS plays all completed MP4 segments into a customized HTML5 `canvas.captureStream(30)` MediaRecorder engine, producing a highly optimized master WebM video output file.
                  </p>
                </div>
              </div>

              <div className="p-6 rounded-3xl bg-gradient-to-r from-sky-950/40 via-neutral-900 to-purple-950/30 border border-sky-500/20 space-y-3 shadow-xl">
                <h4 className="font-black text-white text-base flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-sky-400 shrink-0" />
                  <span>CORS Proxy & Client-Side Privacy</span>
                </h4>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  To ensure zero CORS security errors occur during cross-origin video frame extraction and stream capturing, KINESIS leverages Vercel Serverless Function Edge proxies for Replicate and Runway. All generated Base64 assets and user API tokens are preserved entirely inside your local browser storage.
                </p>
              </div>

              <div className="pt-4 flex justify-center">
                <button
                  onClick={() => setActivePortalTab("feed")}
                  className="rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 px-8 py-4 text-sm font-black uppercase tracking-wider text-white transition-all shadow-xl shadow-sky-500/25 cursor-pointer"
                >
                  Return to Video Studio Feed
                </button>
              </div>
            </div>
          </div>
        ) : activePortalTab === "switches" ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-fadeIn font-sans">
            <FeatureSwitchBar switches={switches} onChange={setSwitches} />
            <div className="p-6 rounded-3xl bg-gradient-to-br from-neutral-900 via-neutral-900 to-sky-950/30 border border-sky-500/20 shadow-xl space-y-3">
              <h4 className="text-base font-black text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-sky-400" />
                <span>Need Professional API Credentials?</span>
              </h4>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Connect your managed provider tokens in the API Keys studio below. Once authenticated, KINESIS gives you completely unfiltered, full-access video orchestration!
              </p>
              <div className="pt-2">
                <ApiKeyManager apiKeys={apiKeys} onChange={setApiKeys} />
              </div>
            </div>
          </div>
        ) : activePortalTab === "vault" ? (
          <div className="animate-fadeIn max-w-7xl mx-auto">
            <CreationHistoryGallery
              items={history}
              onLoadSession={handleLoadSession}
              onDeleteItem={handleDeleteHistoryItem}
              onClearAll={handleClearAllHistory}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start font-sans">
            
            {/* Left Control Feed Column (Step 1 & Step 2) */}
            <div className="space-y-6 lg:col-span-5 lg:col-start-1">
              
              {/* Top Configuration & Tokens Studio */}
              <ApiKeyManager apiKeys={apiKeys} onChange={setApiKeys} />
              
              {/* Step 1: Source Image Keyframe */}
              <div className="rounded-3xl border border-neutral-800/80 bg-neutral-900/90 p-6 sm:p-7 shadow-2xl backdrop-blur transition-all space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
                  <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-200">
                    <span className="flex items-center justify-center h-5 w-5 rounded-lg bg-sky-500 text-white text-[10px] shadow-md shadow-sky-500/30">1</span>
                    <span>Source Keyframe Image</span>
                  </h2>
                  <span className="text-[11px] font-bold text-neutral-500">First Frame Anchor</span>
                </div>
                
                <ImageUploader imageUrl={sourceImageUrl} onImageChange={setSourceImageUrl} />
              </div>

              {/* Step 2: Generation Parameter Tuning */}
              <div className="rounded-3xl border border-neutral-800/80 bg-neutral-900/90 p-6 sm:p-7 shadow-2xl backdrop-blur transition-all space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-800/80">
                  <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-200">
                    <span className="flex items-center justify-center h-5 w-5 rounded-lg bg-sky-500 text-white text-[10px] shadow-md shadow-sky-500/30">2</span>
                    <span>Cinematic Prompt & Settings</span>
                  </h2>
                  <span className="text-[11px] font-bold text-neutral-500">Auto-Chaining Execution</span>
                </div>

                <GenerationControls
                  settings={settings}
                  onChange={setSettings}
                  apiKeys={apiKeys}
                  onSelectPreset={handleSelectPreset}
                />
              </div>

              {/* Primary Master Execution Trigger */}
              <div className="pt-1">
                <button
                  onClick={pipelineState.status === "generating" ? cancelPipeline : handleStartExecution}
                  disabled={!canGenerate && pipelineState.status !== "generating"}
                  className={`w-full rounded-3xl py-4.5 font-black text-sm tracking-widest uppercase shadow-2xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-neutral-950 flex items-center justify-center gap-2.5 cursor-pointer ${
                    pipelineState.status === "generating"
                      ? "bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 animate-pulse"
                      : canGenerate
                      ? "bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-xl shadow-sky-500/20 active:scale-[0.99]"
                      : "bg-neutral-900 border border-neutral-800/80 text-neutral-600 cursor-not-allowed shadow-none"
                  }`}
                >
                  {pipelineState.status === "generating" ? (
                    <>
                      <Square className="h-5 w-5 fill-current" />
                      <span>Interrupt Pipeline Execution</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-5 w-5 fill-current" />
                      <span>Generate Production Sequence</span>
                    </>
                  )}
                </button>
                
                {!canGenerate && pipelineState.status === "idle" && (
                  <p className="text-center text-xs text-amber-400/90 mt-3 font-semibold leading-relaxed bg-amber-500/10 p-2.5 rounded-2xl border border-amber-500/20">
                    ⚠️ Please link your Provider Tokens in the top API Keys panel or configure your Local ComfyUI URL to enable generation.
                  </p>
                )}
              </div>
            </div>

            {/* Right Output feed Column (Step 3: Execution Timeline Monitor & Video Showcase) */}
            <div className="space-y-6 lg:col-span-7">
              <div className="rounded-3xl border border-neutral-800/80 bg-neutral-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur min-h-[620px] flex flex-col justify-between transition-all space-y-6">
                
                <div className="flex items-center justify-between pb-3 border-b border-neutral-800/80">
                  <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-neutral-200">
                    <span className="flex items-center justify-center h-5 w-5 rounded-lg bg-sky-500 text-white text-[10px] shadow-md shadow-sky-500/30">3</span>
                    <span>Execution Monitor Feed & Showcase</span>
                  </h2>
                  <span className="flex items-center gap-1.5 text-xs font-bold text-neutral-400">
                    <Layers className="h-4 w-4 text-sky-400" />
                    <span>Real-Time Chaining</span>
                  </span>
                </div>
                
                {/* Idle Feeds Status Placeholder */}
                {pipelineState.status === "idle" && !pipelineState.stitchedUrl && (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-neutral-800 bg-neutral-950 p-10 text-center text-neutral-500 space-y-4 my-auto min-h-[420px]">
                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-neutral-900 text-neutral-400 border border-neutral-800 shadow-lg">
                      <RefreshCw className="h-8 w-8 animate-spin duration-3000 text-sky-500" />
                    </div>
                    <div className="space-y-2 max-w-md">
                      <p className="text-lg font-black text-white tracking-wide">System Storyboard Ready</p>
                      <p className="text-xs text-neutral-400 leading-relaxed font-medium">
                        Select an elite style preset on the left or upload an anchor image and write a cinematic prompt to initiate continuous video slices execution.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2 bg-neutral-900/80 px-3.5 py-1.5 rounded-full border border-neutral-800">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                      <span className="text-xs font-bold text-emerald-400">Orchestration threads idle</span>
                    </div>
                  </div>
                )}

                {/* Active Feeds Execution Progress Monitor */}
                {pipelineState.status !== "idle" && (
                  <div className="space-y-6 flex-1 flex flex-col justify-center animate-fadeIn">
                    <PipelineStatus state={pipelineState} logs={allAggregatedLogs} />
                  </div>
                )}

                {/* Completed Execution Showcase Video Player */}
                {pipelineState.stitchedUrl && (
                  <div className="mt-6 animate-fadeIn">
                    <VideoPlayer state={pipelineState} />
                  </div>
                )}

                {/* Instructive Footer Monitor Information Card */}
                <div className="rounded-3xl bg-neutral-950 p-5 border border-neutral-800/80 flex items-start gap-3.5 mt-auto shadow-inner">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0 shadow-md">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black text-white uppercase tracking-wider">Automated Concatenation Stitched Feed</p>
                    <p className="text-xs text-neutral-400 leading-relaxed font-medium">
                      Intermediate MP4 video chunks are accurately buffered via HTML5 Canvas `captureStream(30)` to output a continuous WebM showcase overriding default API boundaries.
                    </p>
                  </div>
                </div>

              </div>
            </div>

          </div>
        )}
      </main>

      {/* Production Grade Full Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950 px-4 sm:px-8 py-7 mt-12 text-xs text-neutral-500 font-sans">
        <div className="mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl">
          <div className="flex items-center gap-2.5">
            <Video className="h-4 w-4 text-sky-400" />
            <span className="font-black text-white tracking-wide">KINESIS</span>
            <span>-- Elite Sony / Apple / Nike Tailored Image-to-Video Production Architecture</span>
          </div>

          <div className="flex items-center gap-4 text-neutral-400 font-bold">
            <span>Open Weights + Unfiltered Live APIs</span>
            <span>•</span>
            <span className="text-sky-400 font-black">v1.0 Pro Release</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const [switches] = useLocalStorage<FeatureSwitches>(LS_KEY_FEATURE_SWITCHES, INITIAL_SWITCHES);

  if (switches.enableGumroadGate) {
    return (
      <GumroadGate productId={switches.gumroadProductId}>
        <MainStudioFeed />
      </GumroadGate>
    );
  }

  return <MainStudioFeed />;
}
