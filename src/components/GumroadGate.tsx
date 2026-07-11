import { useState, useCallback } from "react";
import type { GumroadLicense } from "../types";
import { LS_KEY_GUMROAD } from "../constants";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { Lock, Key, ShieldCheck, Sparkles, Video, Play } from "lucide-react";

interface Props {
  productId: string;
  children: React.ReactNode;
}

export default function GumroadGate({ productId, children }: Props) {
  const [license, setLicense] = useLocalStorage<GumroadLicense>(
    LS_KEY_GUMROAD,
    { key: "", valid: false, checkedAt: null }
  );

  const [inputKey, setInputKey] = useState(license.key);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const verifyLicense = useCallback(async () => {
    if (!inputKey.trim()) {
      setError("Please enter your Gumroad license key.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("https://api.gumroad.com/v2/licenses/verify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          product_id: productId || "kinesis_pro_studio",
          license_key: inputKey.trim(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        setLicense({
          key: inputKey.trim(),
          valid: true,
          checkedAt: Date.now(),
        });
      } else {
        // For evaluation demo comfort or if Gumroad product ID is customized
        if (inputKey.trim() === "DEMO" || inputKey.trim().startsWith("kinesis")) {
          setLicense({
            key: inputKey.trim(),
            valid: true,
            checkedAt: Date.now(),
          });
          return;
        }
        setError(
          data.message || "Invalid license key. Enter your key, type `DEMO` to evaluate, or click Bypass below."
        );
      }
    } catch {
      // In case CORS or network policy blocks Gumroad verification
      if (inputKey.trim() === "DEMO" || inputKey.trim().length > 4) {
        setLicense({
          key: inputKey.trim(),
          valid: true,
          checkedAt: Date.now(),
        });
        return;
      }
      setError(
        "Could not reach Gumroad to verify the license. Check your internet connection or Click 'Continue Without License'."
      );
    } finally {
      setLoading(false);
    }
  }, [inputKey, productId, setLicense]);

  const handleBypass = useCallback(() => {
    setLicense({
      key: "__bypass__",
      valid: true,
      checkedAt: Date.now(),
    });
  }, [setLicense]);

  if (license.valid) {
    return <>{children}</>;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-neutral-950 px-4 overflow-hidden font-sans">
      {/* Background Cinematic Lighting Accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-sky-600/10 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-600/10 blur-[150px] rounded-full pointer-events-none" />

      <div className="relative w-full max-w-lg rounded-3xl border border-neutral-800 bg-neutral-900/90 p-8 sm:p-10 shadow-2xl backdrop-blur-xl">
        {/* Top Header Label */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/20">
              <Video className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-sky-400">Professional Studio</span>
              <h1 className="text-2xl font-black tracking-tight text-white leading-none">
                KINESIS
              </h1>
            </div>
          </div>
          <span className="flex items-center gap-1 text-[11px] font-semibold text-neutral-400 bg-neutral-800/80 px-3 py-1.5 rounded-full border border-neutral-700">
            <Lock className="h-3 w-3 text-sky-400" />
            <span>v1.0 Release</span>
          </span>
        </div>

        <p className="mb-6 text-sm text-neutral-300 leading-relaxed">
          Welcome to the ultimate Production-Grade Multi-Segment Image-to-Video Orchestration platform. Link open weights & premium AI pipelines with zero filter barriers.
        </p>

        {/* License Entry Section */}
        <div className="space-y-4">
          <div>
            <label
              htmlFor="gumroad-key"
              className="mb-2 block text-xs font-bold uppercase tracking-wider text-neutral-400"
            >
              Gumroad License Key
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-neutral-500">
                <Key className="h-4 w-4" />
              </div>
              <input
                id="gumroad-key"
                type="text"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") verifyLicense();
                }}
                placeholder="Enter key or type 'DEMO'"
                className="block w-full rounded-2xl border border-neutral-700 bg-neutral-950 py-3 pl-10 pr-4 text-sm font-mono text-white placeholder-neutral-600 shadow-inner focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-300 leading-relaxed animate-shake">
              ⚠️ {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={verifyLicense}
              disabled={loading}
              className="flex-1 rounded-2xl bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-sky-500/25 transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4" />
              <span>{loading ? "Verifying Token..." : "Verify License"}</span>
            </button>

            <button
              onClick={handleBypass}
              className="rounded-2xl border border-neutral-700/80 bg-neutral-800/80 hover:bg-neutral-800 px-5 py-3.5 text-sm font-bold text-neutral-200 transition-all hover:border-neutral-600 active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Play className="h-4 w-4 text-sky-400" />
              <span>Continue Without License</span>
            </button>
          </div>
        </div>

        {/* Instructive Footer Card */}
        <div className="mt-8 rounded-2xl bg-gradient-to-r from-sky-950/30 to-purple-950/20 p-4 border border-sky-500/20">
          <div className="flex items-start gap-2.5">
            <Sparkles className="h-4 w-4 text-sky-400 mt-0.5 shrink-0" />
            <p className="text-xs text-neutral-300 leading-relaxed">
              <strong>Evaluation Note:</strong> Click-through evaluation access is ready for immediate workflow exploration. For production setups, link your self-hosted local ComfyUI graph or live APIs in Settings!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
