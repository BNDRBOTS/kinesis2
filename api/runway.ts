export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }
  
  const auth = req.headers.get('Authorization');
  const version = req.headers.get('X-Runway-Version') || '2024-11-06';
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  let targetUrl = '';
  let body;

  if (req.method === 'POST') {
    const payload = await req.json();
    const { targetPath, ...runwayPayload } = payload;
    targetUrl = `https://api.dev.runwayml.com${targetPath}`;
    body = JSON.stringify(runwayPayload);
  } else {
    const targetPath = url.searchParams.get('targetPath');
    targetUrl = `https://api.dev.runwayml.com${targetPath}`;
  }

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
    headers: { 'Content-Type': 'application/json' }
  });
}
