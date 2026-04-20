/**
 * Cloudflare-native /api/article-like
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function normalizeStatus(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'draft' ? 'draft' : 'published';
}

async function loadArticles(env) {
  if (!env || !env.CMS_KV) return null;
  const raw = await env.CMS_KV.get('cms_articles', 'json');
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

async function saveArticles(env, articles) {
  await env.CMS_KV.put('cms_articles', JSON.stringify(articles || []));
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env || !env.CMS_KV) {
    return new Response(JSON.stringify({ error: 'CMS_KV binding is missing on Cloudflare.' }), { status: 503, headers: CORS });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  }
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
    return new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), { status: 400, headers: CORS });
  }

  try {
    const body = await request.json();
    const id = String((body && body.id) || '').trim();
    if (!id) {
      return new Response(JSON.stringify({ error: 'id is required' }), { status: 400, headers: CORS });
    }
    const articles = await loadArticles(env);
    if (!Array.isArray(articles)) {
      return new Response(JSON.stringify({ error: 'Unable to read articles from CMS_KV.' }), { status: 500, headers: CORS });
    }
    const index = articles.findIndex((a) => String(a && a.id) === id);
    if (index === -1) {
      return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404, headers: CORS });
    }
    if (normalizeStatus(articles[index].status) !== 'published') {
      return new Response(JSON.stringify({ error: 'Article is not published' }), { status: 403, headers: CORS });
    }
    const prev = Math.max(0, parseInt(articles[index].likeCount, 10) || 0);
    const likeCount = prev + 1;
    articles[index] = { ...articles[index], likeCount };
    await saveArticles(env, articles);
    return new Response(JSON.stringify({ ok: true, id, likeCount }), { status: 200, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: e && e.message ? e.message : 'Internal error' }), { status: 500, headers: CORS });
  }
}
