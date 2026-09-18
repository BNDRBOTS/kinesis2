export async function apiFetch(
  url: string,
  init: RequestInit,
  options?: { maxRetries?: number; timeoutMs?: number }
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? 2;
  const timeoutMs = options?.timeoutMs ?? 120_000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) return res;

      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 16_000);
        await sleep(delay);
        continue;
      }

      let body = "";
      try {
        body = await res.text();
      } catch {
        /* ignore read failures */
      }
      throw new Error(`HTTP ${res.status} from ${url}: ${body.slice(0, 600)}`);
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === "AbortError") {
        if (attempt < maxRetries) {
          await sleep(2000);
          continue;
        }
        throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
      }
      // For network errors, retry if attempts left
      if (attempt < maxRetries) {
        const isNetworkError = err instanceof TypeError || (err instanceof Error && err.message.includes("fetch"));
        if (isNetworkError) {
          await sleep(1000 * Math.pow(2, attempt));
          continue;
        }
      }
      throw err;
    }
  }
  throw new Error(`apiFetch: exhausted retries for ${url}`);
}

export function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(",");
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

// Media proxy helper - routes remote media through /api/media to add CORS headers
export function getProxiedMediaUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;
  // Don't proxy data URLs, blob URLs, or already proxied URLs
  if (
    originalUrl.startsWith("data:") ||
    originalUrl.startsWith("blob:") ||
    originalUrl.includes("/api/media?") ||
    originalUrl.startsWith("/")
  ) {
    return originalUrl;
  }

  // Only proxy https URLs
  if (!originalUrl.startsWith("https://") && !originalUrl.startsWith("http://")) {
    return originalUrl;
  }

  // In browser, try to use proxy for all remote media to ensure CORS
  // The proxy adds Access-Control-Allow-Origin: * which is needed for canvas extraction
  try {
    // Use proxy for known problematic domains and all remote for safety
    return `/api/media?url=${encodeURIComponent(originalUrl)}`;
  } catch {
    return originalUrl;
  }
}

// Try to get original URL from proxied URL
export function getOriginalMediaUrl(proxiedUrl: string): string {
  if (proxiedUrl.includes("/api/media?")) {
    try {
      const url = new URL(proxiedUrl, window.location.origin);
      const original = url.searchParams.get("url");
      if (original) return original;
    } catch {}
  }
  return proxiedUrl;
}

export function extractLastFrame(videoUrl: string): Promise<string> {
  // Try proxied URL first to ensure CORS headers
  const proxiedUrl = getProxiedMediaUrl(videoUrl);
  
  return new Promise((resolve, reject) => {
    const attemptExtraction = (urlToTry: string, isRetry: boolean = false) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;

      const timeout = setTimeout(() => {
        cleanup();
        if (!isRetry && urlToTry === proxiedUrl && videoUrl !== proxiedUrl) {
          console.warn("Frame extraction timed out with proxied URL, trying original:", videoUrl);
          attemptExtraction(videoUrl, true);
        } else if (!isRetry && urlToTry !== proxiedUrl) {
          console.warn("Frame extraction timed out with original, trying proxied:", proxiedUrl);
          attemptExtraction(proxiedUrl, true);
        } else {
          reject(new Error("Timed out extracting last frame (60s)"));
        }
      }, 30_000);

      function cleanup() {
        clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
        try {
          video.pause();
          video.src = "";
          video.load();
        } catch {}
      }

      function onError() {
        cleanup();
        const errMsg = `Failed to load video for frame extraction: ${urlToTry}`;
        if (!isRetry) {
          // Try fallback
          const fallbackUrl = urlToTry === proxiedUrl ? videoUrl : proxiedUrl;
          if (fallbackUrl !== urlToTry) {
            console.warn(`${errMsg}, trying fallback:`, fallbackUrl);
            attemptExtraction(fallbackUrl, true);
            return;
          }
        }
        reject(new Error(errMsg));
      }

      function onMeta() {
        try {
          // Seek to near end, but not exactly end to avoid black frames
          const duration = video.duration;
          if (!isFinite(duration) || duration === 0) {
            video.currentTime = 0;
          } else {
            video.currentTime = Math.max(0, duration - 0.1);
          }
        } catch {
          video.currentTime = 0;
        }
      }

      function onSeeked() {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            cleanup();
            reject(new Error("Could not create canvas context"));
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          let dataUrl: string;
          try {
            dataUrl = canvas.toDataURL("image/png");
          } catch (canvasErr: any) {
            cleanup();
            // CORS tainted
            if (!isRetry) {
              const fallbackUrl = urlToTry === proxiedUrl ? videoUrl : proxiedUrl;
              if (fallbackUrl !== urlToTry) {
                console.warn("Canvas tainted (CORS), trying fallback URL:", fallbackUrl);
                attemptExtraction(fallbackUrl, true);
                return;
              }
            }
            reject(new Error("CORS_TAINTED: Cannot extract frame from cross-origin video without CORS headers. Proxied URL: " + proxiedUrl + " Original: " + videoUrl));
            return;
          }
          cleanup();
          resolve(dataUrl);
        } catch (err) {
          cleanup();
          if (!isRetry) {
            const fallbackUrl = urlToTry === proxiedUrl ? videoUrl : proxiedUrl;
            if (fallbackUrl !== urlToTry) {
              attemptExtraction(fallbackUrl, true);
              return;
            }
          }
          reject(err);
        }
      }

      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("seeked", onSeeked);
      video.addEventListener("error", onError);
      video.src = urlToTry;
      try {
        video.load();
      } catch (e) {
        onError();
      }
    };

    // Start with proxied URL
    attemptExtraction(proxiedUrl, false);
  });
}

export async function stitchVideos(videoUrls: string[]): Promise<string> {
  if (videoUrls.length === 0) throw new Error("No videos to stitch");
  if (videoUrls.length === 1) return videoUrls[0];

  // Use proxied URLs for all to ensure CORS
  const proxiedUrls = videoUrls.map(getProxiedMediaUrl);

  const probe = document.createElement("video");
  probe.crossOrigin = "anonymous";
  probe.muted = true;
  probe.preload = "auto";
  probe.playsInline = true;

  let probeWidth = 1280;
  let probeHeight = 720;

  // Try to probe with proxied first, then original
  const tryProbe = async (urls: string[]): Promise<{ width: number; height: number }> => {
    for (const url of urls) {
      try {
        const dims = await new Promise<{ width: number; height: number }>((res, rej) => {
          const v = document.createElement("video");
          v.crossOrigin = "anonymous";
          v.muted = true;
          v.preload = "auto";
          v.playsInline = true;
          const t = setTimeout(() => {
            v.src = "";
            rej(new Error("Probe timeout"));
          }, 15000);
          v.onloadedmetadata = () => {
            clearTimeout(t);
            const w = v.videoWidth || 1280;
            const h = v.videoHeight || 720;
            v.src = "";
            res({ width: w, height: h });
          };
          v.onerror = () => {
            clearTimeout(t);
            v.src = "";
            rej(new Error("Probe failed"));
          };
          v.src = url;
          v.load();
        });
        return dims;
      } catch (e) {
        console.warn(`Probe failed for ${url}, trying next`, e);
        continue;
      }
    }
    throw new Error("All probe attempts failed");
  };

  try {
    const dims = await tryProbe(proxiedUrls.length > 0 ? proxiedUrls : videoUrls);
    probeWidth = dims.width;
    probeHeight = dims.height;
  } catch {
    console.warn("Stitching: Could not probe any video, using default 1280x720 and returning first URL as fallback if stitch fails");
  }

  try {
    probe.src = "";
    probe.load();
  } catch {}

  const canvas = document.createElement("canvas");
  canvas.width = probeWidth;
  canvas.height = probeHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.warn("Stitching failed: Could not get canvas context. Returning first URL.");
    return videoUrls[0];
  }

  const stream = canvas.captureStream(30);
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
    ? "video/webm;codecs=vp8"
    : "video/webm";

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start(100);

  try {
    // Try stitching with proxied URLs first
    for (let i = 0; i < proxiedUrls.length; i++) {
      const proxied = proxiedUrls[i];
      const original = videoUrls[i];
      try {
        await playVideoToCanvas(proxied, ctx, probeWidth, probeHeight);
      } catch (e) {
        console.warn(`Stitch failed with proxied URL ${proxied}, trying original ${original}`, e);
        try {
          await playVideoToCanvas(original, ctx, probeWidth, probeHeight);
        } catch (e2) {
          console.warn(`Stitch failed with original too, skipping segment ${i}`, e2);
          // Continue to next segment rather than failing entirely
          continue;
        }
      }
    }
  } catch (err) {
    try {
      recorder.stop();
    } catch {}
    console.warn("Stitching failed due to CORS or playback error. Returning first video URL as fallback.", err);
    return videoUrls[0];
  }

  recorder.stop();
  await new Promise<void>((res) => {
    recorder.onstop = () => res();
    // Safety timeout
    setTimeout(() => res(), 5000);
  });

  if (chunks.length === 0) {
    console.warn("Stitching produced no chunks, returning first URL");
    return videoUrls[0];
  }

  const blob = new Blob(chunks, { type: mimeType });
  return URL.createObjectURL(blob);
}

function playVideoToCanvas(
  url: string,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out playing video for stitch: ${url}`));
    }, 60_000);

    let rafId: number;

    function draw() {
      if (!video.paused && !video.ended) {
        try {
          ctx.drawImage(video, 0, 0, width, height);
        } catch (e) {
          // CORS taint during draw
          console.warn("CORS taint during drawImage", e);
        }
        rafId = requestAnimationFrame(draw);
      }
    }

    function cleanup() {
      clearTimeout(timeout);
      cancelAnimationFrame(rafId);
      try {
        video.pause();
        video.src = "";
        video.load();
      } catch {}
    }

    video.onloadeddata = () => {
      video.play().then(() => {
        draw();
      }).catch(() => {
        cleanup();
        resolve();
      });
    };

    video.onended = () => {
      try {
        ctx.drawImage(video, 0, 0, width, height);
      } catch {}
      cleanup();
      resolve();
    };

    video.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load video: ${url}`));
    };

    video.src = url;
    try {
      video.load();
    } catch {
      cleanup();
      reject(new Error(`Failed to load video: ${url}`));
    }
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
