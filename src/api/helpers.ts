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
      throw new Error(`HTTP ${res.status} from ${url}: ${body.slice(0, 400)}`);
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof DOMException && err.name === "AbortError") {
        if (attempt < maxRetries) {
          await sleep(2000);
          continue;
        }
        throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
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

export function extractLastFrame(videoUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out extracting last frame"));
    }, 60_000);

    function cleanup() {
      clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      video.src = "";
      video.load();
    }

    function onError() {
      cleanup();
      reject(new Error("Failed to load video for frame extraction"));
    }

    function onMeta() {
      video.currentTime = Math.max(0, video.duration - 0.05);
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
        ctx.drawImage(video, 0, 0);
        let dataUrl: string;
        try {
          dataUrl = canvas.toDataURL("image/png");
        } catch (canvasErr) {
          cleanup();
          reject(new Error("CORS_TAINTED: Cannot extract frame from cross-origin video without CORS headers."));
          return;
        }
        cleanup();
        resolve(dataUrl);
      } catch (err) {
        cleanup();
        reject(err);
      }
    }

    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.src = videoUrl;
    video.load();
  });
}

export async function stitchVideos(videoUrls: string[]): Promise<string> {
  if (videoUrls.length === 0) throw new Error("No videos to stitch");
  if (videoUrls.length === 1) return videoUrls[0];

  const probe = document.createElement("video");
  probe.crossOrigin = "anonymous";
  probe.muted = true;
  probe.preload = "auto";

  try {
    await new Promise<void>((res, rej) => {
      probe.onloadedmetadata = () => res();
      probe.onerror = () => rej(new Error("Failed to probe first video"));
      probe.src = videoUrls[0];
      probe.load();
    });
  } catch {
    console.warn("Stitching failed: Could not load first video. Returning first URL as fallback.");
    return videoUrls[0];
  }

  const width = probe.videoWidth || 1280;
  const height = probe.videoHeight || 720;
  probe.src = "";
  probe.load();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
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
    for (const url of videoUrls) {
      await playVideoToCanvas(url, ctx, width, height);
    }
  } catch (err) {
    recorder.stop();
    console.warn("Stitching failed due to CORS or playback error. Returning first video URL as fallback.", err);
    return videoUrls[0];
  }

  recorder.stop();
  await new Promise<void>((res) => {
    recorder.onstop = () => res();
  });
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

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out playing video for stitch"));
    }, 120_000);

    let rafId: number;

    function draw() {
      if (!video.paused && !video.ended) {
        ctx.drawImage(video, 0, 0, width, height);
        rafId = requestAnimationFrame(draw);
      }
    }

    function cleanup() {
      clearTimeout(timeout);
      cancelAnimationFrame(rafId);
      video.pause();
      video.src = "";
      video.load();
    }

    video.onloadeddata = () => {
      video.play().catch(() => {
        cleanup();
        resolve();
      });
      draw();
    };
    video.onended = () => {
      ctx.drawImage(video, 0, 0, width, height);
      cleanup();
      resolve();
    };

    video.onerror = () => {
      cleanup();
      reject(new Error(`Failed to load video: ${url}`));
    };

    video.src = url;
    video.load();
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
