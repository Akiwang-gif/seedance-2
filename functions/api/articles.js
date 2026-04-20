/**
 * Cloudflare-native articles API.
 * - GET /api/articles
 * - POST /api/articles
 * - PATCH /api/articles   (reorder)
 */
import {
  normalizeStatus,
  sortPublishedForPublic,
  loadArticles,
  saveArticles,
  optimizeBodyHtml,
  buildDescription,
  mapPublishedArticleForPublic,
  publishedAtFromDateOnly,
  defaultPublishedAtForNew,
} from '../_lib/articles-common.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Content-Type': 'application/json',
};

function getBearer(request) {
  const auth = String(request.headers.get('authorization') || '');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function canWrite(request, env) {
  const token = getBearer(request);
  const secret = String((env && env.CMS_WRITE_SECRET) || (env && env.CMS_SECRET) || '').trim();
  if (!secret) return false;
  return token === secret;
}

function canReadAll(request, env) {
  return canWrite(request, env);
}

function nativeWriteEnabled(env) {
  // Fully-Cloudflare default: native write enabled unless explicitly disabled.
  return String((env && env.CF_USE_NATIVE_ARTICLES_WRITE) || '').trim() !== '0';
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (!env || !env.CMS_KV) {
    return new Response(JSON.stringify({ error: 'CMS_KV binding is missing on Cloudflare.' }), { status: 503, headers: CORS });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method === 'GET') {
    const includeAll = String(url.searchParams.get('scope') || '').toLowerCase() === 'all';
    if (includeAll && !canReadAll(request, env)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. scope=all requires Authorization: Bearer <CMS_WRITE_SECRET>.' }),
        { status: 401, headers: CORS },
      );
    }
    const articles = await loadArticles(env);
    if (!Array.isArray(articles)) {
      return new Response(JSON.stringify({ error: 'Unable to read articles from CMS_KV.' }), { status: 500, headers: CORS });
    }
    const normalized = articles.map((a) => ({ ...a, status: normalizeStatus(a && a.status) }));
    const visible = includeAll ? normalized : sortPublishedForPublic(normalized);
    const payload = includeAll ? visible : visible.map(mapPublishedArticleForPublic);
    const headers = new Headers(CORS);
    headers.set('X-Store', 'cf-kv');
    headers.set('X-Articles-Count', String(payload.length));
    headers.set('Access-Control-Expose-Headers', 'X-Store, X-Articles-Count');
    return new Response(JSON.stringify(payload), { status: 200, headers });
  }

  if (!nativeWriteEnabled(env)) {
    return new Response(JSON.stringify({ error: 'Native write disabled (set CF_USE_NATIVE_ARTICLES_WRITE=1 or unset it).' }), { status: 503, headers: CORS });
  }

  if (request.method === 'POST') {
    if (!canWrite(request, env)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    const ct = (request.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), { status: 400, headers: CORS });
    }
    try {
      const body = await request.json();
      const title = String(body.title ?? '').trim();
      let description = String(body.description ?? '').trim();
      const category = String(body.category ?? 'News').trim() || 'News';
      let imageUrl = String(body.imageUrl ?? '').trim();
      const author = String(body.author ?? '').trim();
      const fontFamily = String(body.fontFamily ?? 'Inter').trim() || 'Inter';
      const fontSize = String(body.fontSize ?? '16px').trim() || '16px';
      const color = String(body.color ?? '#1d1d1f').trim() || '#1d1d1f';
      const fontWeight = String(body.fontWeight ?? 'normal').trim() || 'normal';
      const fontStyle = String(body.fontStyle ?? 'normal').trim() || 'normal';
      const cardTitleFontFamily = String(body.cardTitleFontFamily ?? 'Inter').trim() || 'Inter';
      const cardTitleFontSize = String(body.cardTitleFontSize ?? '16px').trim() || '16px';
      const cardTitleColor = String(body.cardTitleColor ?? '#1d1d1f').trim() || '#1d1d1f';
      const cardTitleFontWeight = String(body.cardTitleFontWeight ?? 'normal').trim() || 'normal';
      const cardTitleFontStyle = String(body.cardTitleFontStyle ?? 'normal').trim() || 'normal';
      let bodyHtml = String(body.bodyHtml ?? '').trim();
      if (bodyHtml) bodyHtml = optimizeBodyHtml(bodyHtml, title);
      description = buildDescription(description, title, bodyHtml);
      if (bodyHtml) {
        const m = bodyHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m && m[1] && (m[1].includes('/') || m[1].startsWith('http'))) imageUrl = m[1];
      }
      const articles = await loadArticles(env);
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const status = normalizeStatus(body.status);
      const nowIso = new Date().toISOString();
      const publishedDateInput = String(body.publishedDate ?? '').trim();
      let publishedAt = null;
      if (status === 'published') {
        publishedAt = publishedAtFromDateOnly(publishedDateInput) || defaultPublishedAtForNew();
      }
      const article = {
        id,
        title,
        description,
        category,
        imageUrl,
        author,
        fontFamily,
        fontSize,
        color,
        fontWeight,
        fontStyle,
        cardTitleFontFamily,
        cardTitleFontSize,
        cardTitleColor,
        cardTitleFontWeight,
        cardTitleFontStyle,
        status,
        likeCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
        publishedAt,
      };
      if (bodyHtml) article.bodyHtml = bodyHtml;

      let next = articles.slice();
      if (status === 'published') {
        article.sortOrder = 0;
        next = next.map((a) => {
          if (normalizeStatus(a && a.status) !== 'published') return a;
          const so = Number(a && a.sortOrder);
          if (Number.isFinite(so)) return { ...a, sortOrder: so + 1 };
          return a;
        });
      }
      next.unshift(article);
      await saveArticles(env, next);
      return new Response(JSON.stringify(article), { status: 201, headers: CORS });
    } catch (e) {
      return new Response(JSON.stringify({ error: (e && e.message) || 'Error' }), { status: 500, headers: CORS });
    }
  }

  if (request.method === 'PATCH') {
    if (!canWrite(request, env)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    const ct = (request.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), { status: 400, headers: CORS });
    }
    try {
      const body = await request.json();
      const ids = Array.isArray(body.ids) ? body.ids.map((v) => String(v || '').trim()).filter(Boolean) : [];
      if (!ids.length) {
        return new Response(JSON.stringify({ error: 'ids array is required' }), { status: 400, headers: CORS });
      }
      const idPos = new Map();
      ids.forEach((id, idx) => idPos.set(id, idx));
      const articles = await loadArticles(env);
      const included = articles
        .filter((a) => idPos.has(String(a.id || '')))
        .sort((a, b) => idPos.get(String(a.id || '')) - idPos.get(String(b.id || '')));
      const remaining = articles.filter((a) => !idPos.has(String(a.id || '')));
      const next = included.concat(remaining).map((a, idx) => ({ ...a, sortOrder: idx }));
      await saveArticles(env, next);
      return new Response(JSON.stringify({ ok: true, count: next.length }), { status: 200, headers: CORS });
    } catch (e) {
      return new Response(JSON.stringify({ error: (e && e.message) || 'Error' }), { status: 500, headers: CORS });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
}
