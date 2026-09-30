export async function apiFetch(url: string, init: RequestInit, options?: { maxRetries?: number; timeoutMs?: number }): Promise<Response> {
  const retries = init.method === 'GET' ? (options?.maxRetries ?? 2) : 0;
  for (let attempt = 0; ; attempt++) {
    init.signal?.throwIfAborted();
    const signal = AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(options?.timeoutMs ?? 120_000)]);
    const res = await fetch(url, { ...init, signal });
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(Math.min(2000 * 2 ** attempt, 16000), init.signal ?? undefined);
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 600)}`);
  }
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

async function processMedia(operation: 'frame' | 'stitch' | 'cache', urls: string[], signal?: AbortSignal): Promise<string> {
  const response = await apiFetch('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, urls }), signal }, { timeoutMs: 600_000 });
  const result = await response.json();
  if (!result.url) throw new Error('Media processor returned no output');
  return result.url;
}
export function extractLastFrame(videoUrl: string, signal?: AbortSignal): Promise<string> {
  return processMedia('frame', [videoUrl], signal);
}
export function stitchVideos(videoUrls: string[], signal?: AbortSignal): Promise<string> {
  if (!videoUrls.length) throw new Error('No videos to stitch');
  if (videoUrls.length === 1) return Promise.resolve(videoUrls[0]);
  return processMedia('stitch', videoUrls, signal);
}
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    function abort() { clearTimeout(timer); reject(signal?.reason ?? new DOMException('Cancelled', 'AbortError')); }
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export function mediaExtension(type: string, url = ''): string {
  const mime = type.split(';')[0];
  return ({ 'video/mp4':'mp4', 'video/webm':'webm', 'audio/mpeg':'mp3', 'audio/wav':'wav', 'audio/mp4':'m4a' } as Record<string,string>)[mime] || url.split('?')[0].match(/\.(mp4|webm|mp3|wav|m4a|mov)$/)?.[1] || 'bin';
}

export function cacheVideo(url: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  // Cloud outputs are already archived byte-for-byte; avoid redundant transcoding.
  if (/^\/outputs\/[a-f0-9-]{36}\.(mp4|webm)$/.test(url)) return Promise.resolve(url);
  return processMedia('cache', [url], signal);
}
