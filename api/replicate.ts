export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }
  
  const auth = req.headers.get('Authorization');
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  let targetUrl = '';
  let body;

  if (req.method === 'POST') {
    const payload = await req.json();
    targetUrl = `https://api.replicate.com${payload.targetPath}`;
    body = JSON.stringify({ input: payload.input });
  } else {
    const targetPath = url.searchParams.get('targetPath');
    targetUrl = `https://api.replicate.com${targetPath}`;
  }

  const res = await fetch(targetUrl, {
    method: req.method,
    headers: {
      'Authorization': auth,
      'Content-Type': 'application/json',
      'Prefer': 'respond-async'
    },
    body
  });

  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' }
  });
}
