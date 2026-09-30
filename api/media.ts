export const config = { runtime: 'edge' };

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range, Origin, Accept, Authorization',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Accept-Ranges',
  'Access-Control-Max-Age': '86400',
};

// Whitelist of allowed media domains for security, but allow any https for flexibility
const ALLOWED_DOMAINS = [
  'v3.fal.media',
  'storage.googleapis.com',
  'fal.media',
  'replicate.delivery',
  'pbxt.replicate.delivery',
  'api.replicate.com',
  'cdn-luma.com',
  'storage.cdn-luma.com',
  'assets.mixkit.co',
  'images.unsplash.com',
  'runwayml.com',
  'api.dev.runwayml.com',
  'comfy.org',
  'huggingface.co',
];

function isAllowedUrl(urlString: string): boolean {
  try {
    const u = new URL(urlString);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    // Allow any https for now to support user uploads, but check if domain is in allowed list or is common CDN
    // For security, we still allow any https but with size limit
    return ALLOWED_DOMAINS.some(domain => u.hostname === domain || u.hostname.endsWith('.' + domain));
  } catch {
    return false;
  }
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Method not allowed, use GET' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const urlObj = new URL(req.url);
  const targetUrl = urlObj.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url query parameter' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!isAllowedUrl(targetUrl)) {
    return new Response(JSON.stringify({ error: 'Invalid or disallowed URL' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const headers: Record<string, string> = {};
    const range = req.headers.get('Range');
    if (range) headers['Range'] = range;
    // Forward User-Agent to avoid blocking
    headers['User-Agent'] = 'KINESIS-Media-Proxy/1.0';
    // Some CDNs require Accept
    headers['Accept'] = req.headers.get('Accept') || '*/*';

    const res = await fetch(targetUrl, {
      method: req.method,
      redirect: "error",
      headers,
    });

    if (!res.ok && res.status !== 206) {
      const text = await res.text().catch(() => '');
      return new Response(JSON.stringify({ error: `Upstream returned ${res.status}`, details: text.slice(0, 500) }), {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build response headers with CORS
    const responseHeaders: Record<string, string> = {
      ...corsHeaders,
    };

    // Copy important headers from upstream
    const contentType = res.headers.get('Content-Type');
    if (contentType) responseHeaders['Content-Type'] = contentType;
    else responseHeaders['Content-Type'] = 'application/octet-stream';

    const contentLength = res.headers.get('Content-Length');
    if (contentLength) responseHeaders['Content-Length'] = contentLength;

    const contentRange = res.headers.get('Content-Range');
    if (contentRange) responseHeaders['Content-Range'] = contentRange;

    const acceptRanges = res.headers.get('Accept-Ranges');
    if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges;

    responseHeaders['Cache-Control'] = 'public, max-age=3600';

    // Stream the body
    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Media proxy failed' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}
