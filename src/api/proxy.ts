import { apiFetch, sleep } from './helpers';
import { POLL_INTERVAL_BASE_MS, POLL_MAX_ATTEMPTS } from '../constants';
export async function providerRequest(provider: string, path: string, key: string, method = 'GET', body?: unknown, signal?: AbortSignal) {
  return (await apiFetch(`/api/${provider}?targetPath=${encodeURIComponent(path)}`, {
    method, signal, headers: { 'Content-Type': 'application/json', ...(key && key !== 'server-managed' ? { Authorization: `Bearer ${key}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })).json();
}
export async function pollProvider(provider: string, path: string, key: string, parse: (data: any) => string | undefined, progress?: (msg: string) => void, signal?: AbortSignal, cancelPath?: string, cancelMethod = 'POST'): Promise<string> {
  const cancel = () => { if (cancelPath) void providerRequest(provider, cancelPath, key, cancelMethod).catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      await sleep(POLL_INTERVAL_BASE_MS, signal);
      const data = await providerRequest(provider, path, key, 'GET', undefined, signal);
      progress?.(data.status || data.state || 'Processing');
      const result = parse(data);
      if (result) return result;
    }
    throw new Error(`${provider} polling timed out`);
  } finally { signal?.removeEventListener('abort', cancel); }
}
