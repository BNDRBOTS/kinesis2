export const config = { runtime: 'edge' };

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Runway-Version, Prefer, X-Fal-Base',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data: string, status: number, contentType?: string) {
  return new Response(data, {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': contentType || 'application/json',
    },
  });
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse(JSON.stringify({ error: 'Method not allowed' }), 405);
  }

  const auth = req.headers.get('Authorization');
  if (!auth) {
    return jsonResponse(JSON.stringify({ error: 'Unauthorized: missing Authorization header' }), 401);
  }

  const url = new URL(req.url);
  let targetPath = '';
  let body: string | undefined;
  let isFormData = false;

  if (req.method === 'POST') {
    const contentType = req.headers.get('Content-Type') || '';
    if (contentType.includes('multipart/form-data') || contentType.includes('application/octet-stream')) {
      // For file uploads, we expect targetPath in query and body is raw form data - not handled here, use /api/fal-file
      return jsonResponse(JSON.stringify({ error: 'Use /api/fal-file for file uploads' }), 400);
    }

    try {
      const payload = await req.json();
      targetPath = payload.targetPath || url.searchParams.get('targetPath') || '';
      // Support both { input: {...} } wrapper and direct input
      if (payload.input && typeof payload.input === 'object') {
        body = JSON.stringify(payload.input);
      } else {
        const { targetPath: _tp, ...rest } = payload;
        // If rest has only input-like keys, use rest as body
        // If payload is already the fal input (has prompt etc), rest is the input
        const hasInputKeys = Object.keys(rest).length > 0;
        if (hasInputKeys) {
          body = JSON.stringify(rest);
        }
      }
    } catch {
      // If not JSON, try query param
      targetPath = url.searchParams.get('targetPath') || '';
    }
  } else {
    targetPath = url.searchParams.get('targetPath') || '';
  }

  if (!targetPath) {
    return jsonResponse(JSON.stringify({ error: 'Missing targetPath query param or body field' }), 400);
  }

  // Determine base URL
  let baseUrl = 'https://queue.fal.run';
  const baseHeader = req.headers.get('X-Fal-Base') || url.searchParams.get('base');
  
  if (baseHeader === 'api' || targetPath.startsWith('/v1/')) {
    baseUrl = 'https://api.fal.ai';
  } else if (baseHeader === 'run' || targetPath.startsWith('/fal-ai/') || targetPath.startsWith('/fal/')) {
    // queue.fal.run is canonical for queue, but fal.run also works
    baseUrl = 'https://queue.fal.run';
  }
  if (!/^\/[a-zA-Z0-9_./?-]+$/.test(targetPath) || targetPath.includes('..') || targetPath.startsWith('//')) return jsonResponse(JSON.stringify({ error: 'Invalid targetPath' }), 400);

  // Normalize targetPath to start with /
  if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;

  const targetUrl = `${baseUrl}${targetPath}`;

  try {
    const res = await fetch(targetUrl, {
      method: req.method,
      redirect: "error",
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
      },
      body,
    });

    const data = await res.text();
    return jsonResponse(data, res.status, res.headers.get('Content-Type') || 'application/json');
  } catch (err: any) {
    return jsonResponse(JSON.stringify({ error: err?.message || 'Upstream fetch failed' }), 502);
  }
}
