/**
 * GET /api/media?u=<encoded https URL> — proxy public Blob or R2 images same-origin.
 */
const CORS = { 'Access-Control-Allow-Origin': '*' };

const ALLOW_BLOB = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;
const ALLOW_R2 = /^https:\/\/[a-z0-9.-]+\.r2\.dev\//i;

function allowed(u) {
  return ALLOW_BLOB.test(u) || ALLOW_R2.test(u);
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const u = String(url.searchParams.get('u') || '').trim();

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }
  if (!u || !allowed(u)) {
    return new Response('Invalid url', { status: 400, headers: CORS });
  }

  try {
    const r = await fetch(u, { redirect: 'follow', headers: { Accept: 'image/*,*/*;q=0.8' } });
    if (!r.ok) {
      return new Response(null, { status: r.status, headers: CORS });
    }
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    const headers = new Headers(CORS);
    headers.set('Content-Type', ct);
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers });
    }
    const buf = await r.arrayBuffer();
    return new Response(buf, { status: 200, headers });
  } catch (e) {
    return new Response('Bad gateway', { status: 502, headers: CORS });
  }
}
