export const config = { runtime: 'edge' };

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Prefer, X-Runway-Version',
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
  if (!auth) return corsJsonResponse(JSON.stringify({ error: 'Unauthorized: missing Authorization' }), 401);

  const url = new URL(req.url);
  let targetUrl = '';
  let body: string | FormData | undefined;
  let isFormData = false;

  if (req.method === 'POST') {
    const contentType = req.headers.get('Content-Type') || '';
    if (contentType.includes('multipart/form-data')) {
      isFormData = true;
      try {
        const formData = await req.formData();
        // targetPath can be in query param for FormData
        const targetPath = url.searchParams.get('targetPath') || '/v1/files';
        targetUrl = `https://api.replicate.com${targetPath}`;
        body = formData;
      } catch {
        return corsJsonResponse(JSON.stringify({ error: 'Failed to parse FormData' }), 400);
      }
    } else {
      try {
        const payload = await req.json();
        if (!payload.targetPath) {
          return corsJsonResponse(JSON.stringify({ error: 'Missing targetPath' }), 400);
        }
        targetUrl = `https://api.replicate.com${payload.targetPath}`;
        if (payload.input) {
          body = JSON.stringify({ input: payload.input });
        } else {
          const { targetPath: _, ...rest } = payload;
          body = JSON.stringify({ input: rest });
        }
      } catch {
        return corsJsonResponse(JSON.stringify({ error: 'Invalid JSON body' }), 400);
      }
    }
  } else {
    const targetPath = url.searchParams.get('targetPath');
    if (!targetPath) {
      return corsJsonResponse(JSON.stringify({ error: 'Missing targetPath query param' }), 400);
    }
    targetUrl = `https://api.replicate.com${targetPath}`;
  }

  try {
    const headers: Record<string, string> = {
      'Authorization': auth,
      'Prefer': 'respond-async'
    };
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body as any
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
