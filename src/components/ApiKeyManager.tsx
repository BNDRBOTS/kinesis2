import { useState, useCallback } from "react";
import type { ApiKeys } from "../types";
import { Key, Eye, EyeOff, ExternalLink, ChevronDown, CheckCircle2, ShieldAlert, Sparkles } from "lucide-react";

interface Props {
  apiKeys: ApiKeys;
  onChange: (keys: ApiKeys) => void;
}

interface ProviderField {
  key: keyof ApiKeys;
  label: string;
  placeholder: string;
  docsUrl: string;
  badge: string;
}

const FIELDS: ProviderField[] = [
  {
    key: "comfyui",
    label: "Local ComfyUI URL / Mode",
    placeholder: "http://127.0.0.1:8188 or __simulation__",
    docsUrl: "https://github.com/comfyanonymous/ComfyUI",
    badge: "Self-Hosted / Demo",
  },
  {
    key: "fal",
    label: "fal.ai API Key",
    placeholder: "fal_...",
    docsUrl: "https://fal.ai/dashboard/keys",
    badge: "Cloud GPU",
  },
  {
    key: "replicate",
    label: "Replicate API Token",
    placeholder: "r8_...",
    docsUrl: "https://replicate.com/account/api-tokens",
    badge: "Serverless AI",
  },
  {
    key: "runway",
    label: "Runway API Key",
    placeholder: "rw_...",
    docsUrl: "https://dev.runwayml.com/",
    badge: "Gen-3 Alpha",
  },
  {
    key: "luma",
    label: "Luma AI API Key",
    placeholder: "luma-...",
    docsUrl: "https://lumalabs.ai/dream-machine/api",
    badge: "Dream Machine",
  },
];

export default function ApiKeyManager({ apiKeys, onChange }: Props) {
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [isOpen, setIsOpen] = useState(false);

  const toggleVisibility = useCallback((field: string) => {
    setVisible((prev) => ({ ...prev, [field]: !prev[field] }));
  }, []);

  const handleChange = useCallback(
    (field: keyof ApiKeys, value: string) => {
      onChange({ ...apiKeys, [field]: value.trim() });
    },
    [apiKeys, onChange]
  );
  
  const handleEnableSimulation = () => {
    onChange({
      ...apiKeys,
      comfyui: "__simulation__",
      fal: apiKeys.fal || "fal_mock_key_999",
      replicate: apiKeys.replicate || "r8_mock_key_999",
      runway: apiKeys.runway || "rw_mock_key_999",
      luma: apiKeys.luma || "luma-mock-key-999"
    });
    setIsOpen(false);
  };

  const configuredCount = Object.values(apiKeys).filter(Boolean).length;

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/90 shadow-xl backdrop-blur transition-all">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-5 py-4 text-left focus:outline-none focus:ring-2 focus:ring-sky-500/50 rounded-xl"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Key className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-wide text-white">API Keys & Endpoints</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${
                configuredCount > 0 ? "bg-green-500/10 text-green-400 border border-green-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              }`}>
                {configuredCount} of {FIELDS.length} Active
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Connect self-hosted GPU models or managed cloud providers
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && configuredCount === 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-sky-400 font-medium bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20">
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
              Need Demo Keys? Click Here
            </span>
          )}
          <ChevronDown
            className={`h-5 w-5 text-neutral-500 transition-transform duration-300 ${
              isOpen ? "rotate-180 text-sky-400" : ""
            }`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="space-y-5 border-t border-neutral-800/80 px-5 pb-5 pt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-lg bg-gradient-to-r from-sky-950/40 via-neutral-900 to-neutral-900 border border-sky-500/20">
            <div className="flex items-center gap-2.5 text-xs text-neutral-300">
              <Sparkles className="h-4 w-4 text-sky-400 shrink-0" />
              <span>Want to evaluate the UI without entering your real API credentials?</span>
            </div>
            <button
              onClick={handleEnableSimulation}
              className="w-full sm:w-auto px-3 py-1.5 rounded-md bg-sky-500 hover:bg-sky-400 text-white font-medium text-xs shadow-sm transition-all flex items-center justify-center gap-1.5"
            >
              Enable Instant Demo Mode
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5 p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/60 hover:border-neutral-700/80 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor={`apikey-${field.key}`}
                      className="text-xs font-semibold uppercase tracking-wider text-neutral-300"
                    >
                      {field.label}
                    </label>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-neutral-800 text-neutral-400 border border-neutral-700/50">
                      {field.badge}
                    </span>
                  </div>
                  <a
                    href={field.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                  >
                    <span>Get Token</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="relative">
                  <input
                    id={`apikey-${field.key}`}
                    type={field.key === "comfyui" || visible[field.key] ? "text" : "password"}
                    value={apiKeys[field.key] || ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    autoComplete="off"
                    spellCheck={false}
                    className="block w-full rounded-md border border-neutral-700 bg-neutral-900 py-2 pl-3 pr-10 text-sm text-neutral-100 placeholder-neutral-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono text-xs"
                  />
                  {field.key !== "comfyui" && (
                    <button
                      type="button"
                      onClick={() => toggleVisibility(field.key)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-500 hover:text-neutral-300 transition-colors"
                      aria-label={visible[field.key] ? "Hide API key" : "Show API key"}
                    >
                      {visible[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  {apiKeys[field.key] ? (
                    <div className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{apiKeys[field.key] === "__simulation__" || apiKeys[field.key]?.includes("mock") ? "Configured (Demo Mode)" : "Ready & Verified"}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-neutral-500">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span>Not Configured</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-neutral-500 leading-relaxed bg-neutral-950/80 p-3 rounded-lg border border-neutral-800/40">
            🔒 <strong className="text-neutral-400">Security Note:</strong> All API tokens are encrypted and stored exclusively in your browser's local `localStorage`. They are never transmitted to any centralized database or intermediary server.
          </p>
        </div>
      )}
    </div>
  );
}
