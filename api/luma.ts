export const config = { runtime: 'edge' };

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
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
    return jsonResponse(JSON.stringify({ error: 'Unauthorized: missing Authorization' }), 401);
  }

  const url = new URL(req.url);
  let targetPath = '';
  let body: string | undefined;

  if (req.method === 'POST') {
    try {
      const payload = await req.json();
      targetPath = payload.targetPath || url.searchParams.get('targetPath') || '/dream-machine/v1/generations';
      if (payload.targetPath) {
        const { targetPath: _, ...rest } = payload;
        if (Object.keys(rest).length > 0) {
          body = JSON.stringify(rest);
        }
      } else {
        // payload is the direct Luma body
        const { targetPath: _tp, ...rest } = payload;
        if (Object.keys(rest).length > 0) {
          body = JSON.stringify(rest);
        } else {
          body = JSON.stringify(payload);
        }
      }
    } catch {
      targetPath = url.searchParams.get('targetPath') || '/dream-machine/v1/generations';
    }
  } else {
    targetPath = url.searchParams.get('targetPath') || '';
  }

  if (!targetPath) {
    return jsonResponse(JSON.stringify({ error: 'Missing targetPath' }), 400);
  }

  if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;

  const targetUrl = `https://api.lumalabs.ai${targetPath}`;

  try {
    const res = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body,
    });

    const data = await res.text();
    return jsonResponse(data, res.status, res.headers.get('Content-Type') || 'application/json');
  } catch (err: any) {
    return jsonResponse(JSON.stringify({ error: err?.message || 'Luma upstream failed' }), 502);
  }
}
