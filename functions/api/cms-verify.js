/**
 * GET|POST /api/cms-verify — admin gate (same contract as api/cms-verify.js on Vercel).
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
  'Access-Control-Allow-Headers': 'Authorization',
};

function getBearer(request) {
  const auth = String(request.headers.get('authorization') || '');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  }

  const secret = String((env && env.CMS_WRITE_SECRET) || (env && env.CMS_SECRET) || '').trim();
  if (!secret) {
    return new Response(
      JSON.stringify({ ok: false, error: 'CMS_WRITE_SECRET not configured on server' }),
      { status: 503, headers: CORS },
    );
  }
  if (getBearer(request) !== secret) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: CORS });
  }
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
}
