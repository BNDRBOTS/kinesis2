export const config = { runtime: 'edge' };

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data: string, status: number) {
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

  if (req.method !== 'POST') {
    return jsonResponse(JSON.stringify({ error: 'Method not allowed' }), 405);
  }

  const auth = req.headers.get('Authorization');
  if (!auth) {
    return jsonResponse(JSON.stringify({ error: 'Unauthorized' }), 401);
  }

  const url = new URL(req.url);
  const targetPath = url.searchParams.get('targetPath') || `/v1/serverless/files/file/local/${encodeURIComponent(`uploads/${Date.now()}.png`)}`;
  
  // Handle FormData upload - we need to forward as-is
  // Edge runtime supports FormData via request.formData()
  try {
    const formData = await req.formData();
    
    const targetUrl = `https://api.fal.ai${targetPath.startsWith('/') ? targetPath : '/' + targetPath}`;
    
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Authorization': auth,
        // Don't set Content-Type, let fetch set it with boundary
      },
      body: formData as any,
    });

    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: {
        ...corsHeaders,
        'Content-Type': res.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (err: any) {
    return jsonResponse(JSON.stringify({ error: err?.message || 'Upload failed' }), 500);
  }
}
