export const config = { runtime: 'edge' };

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Runway-Version, Prefer',
  'Access-Control-Max-Age': '86400',
};

function corsJsonResponse(data: string, status: number) {
  return new Response(data, {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return corsJsonResponse(JSON.stringify({ error: 'Method not allowed' }), 405);
  }
  
  const auth = req.headers.get('Authorization');
  const version = req.headers.get('X-Runway-Version') || '2024-11-06';
  if (!auth) return corsJsonResponse(JSON.stringify({ error: 'Unauthorized: missing Authorization' }), 401);

  const url = new URL(req.url);
  let targetUrl = '';
  let body: string | undefined;

  if (req.method === 'POST') {
    try {
      const payload = await req.json();
      const { targetPath, ...runwayPayload } = payload;
      if (!targetPath) {
        return corsJsonResponse(JSON.stringify({ error: 'Missing targetPath' }), 400);
      }
      targetUrl = `https://api.dev.runwayml.com${targetPath}`;
      body = JSON.stringify(runwayPayload);
    } catch {
      return corsJsonResponse(JSON.stringify({ error: 'Invalid JSON body' }), 400);
    }
  } else {
    const targetPath = url.searchParams.get('targetPath');
    if (!targetPath) {
      return corsJsonResponse(JSON.stringify({ error: 'Missing targetPath query param' }), 400);
    }
    targetUrl = `https://api.dev.runwayml.com${targetPath}`;
  }

  try {
    const res = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
        'X-Runway-Version': version
      },
      body
    });

    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: {
        ...corsHeaders,
        'Content-Type': res.headers.get('Content-Type') || 'application/json',
      }
    });
  } catch (err: any) {
    return corsJsonResponse(JSON.stringify({ error: err?.message || 'Upstream fetch failed' }), 502);
  }
}
