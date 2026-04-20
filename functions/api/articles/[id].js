/**
 * Cloudflare-native /api/articles/:id
 * - GET /api/articles/:id
 * - PUT /api/articles/:id
 * - DELETE /api/articles/:id
 */
import {
  normalizeStatus,
  loadArticles,
  saveArticles,
  publishedAtFromDateOnly,
  defaultPublishedAtForNew,
} from '../../_lib/articles-common.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
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

function nativeWriteEnabled(env) {
  return String((env && env.CF_USE_NATIVE_ARTICLES_WRITE) || '').trim() !== '0';
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const id = String((params && params.id) || '').trim();
  if (!id) {
    return new Response(JSON.stringify({ error: 'Article id is required' }), { status: 400, headers: CORS });
  }

  if (!env || !env.CMS_KV) {
    return new Response(JSON.stringify({ error: 'CMS_KV binding is missing on Cloudflare.' }), { status: 503, headers: CORS });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method === 'GET') {
    const articles = await loadArticles(env);
    if (!Array.isArray(articles)) {
      return new Response(JSON.stringify({ error: 'Unable to read articles from CMS_KV.' }), { status: 500, headers: CORS });
    }
    const article = articles.find((a) => String(a && a.id) === id);
    if (!article) {
      return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404, headers: CORS });
    }
    if (normalizeStatus(article.status) === 'draft' && !canWrite(request, env)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    return new Response(JSON.stringify(article), { status: 200, headers: CORS });
  }

  if (!nativeWriteEnabled(env)) {
    return new Response(JSON.stringify({ error: 'Native write disabled (set CF_USE_NATIVE_ARTICLES_WRITE=1 or unset it).' }), { status: 503, headers: CORS });
  }

  if (request.method === 'PUT') {
    if (!canWrite(request, env)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    const ct = (request.headers.get('content-type') || '').toLowerCase();
    if (!ct.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Content-Type must be application/json' }), { status: 400, headers: CORS });
    }
    try {
      const body = await request.json();
      const articles = await loadArticles(env);
      const index = articles.findIndex((a) => String(a && a.id) === id);
      if (index === -1) {
        return new Response(JSON.stringify({ error: 'Article not found' }), { status: 404, headers: CORS });
      }
      const existing = articles[index];
      const status = normalizeStatus(body.status ?? existing.status);
      const publishedDateInput = String(body.publishedDate ?? '').trim();
      const existingLikes = Math.max(0, parseInt(existing.likeCount, 10) || 0);
      let likeCount = existingLikes;
      if (body.likeCount !== undefined && body.likeCount !== null && body.likeCount !== '') {
        const n = parseInt(body.likeCount, 10);
        if (Number.isFinite(n) && n >= 0) likeCount = n;
      }
      const updated = {
        ...existing,
        likeCount,
        title: String(body.title ?? existing.title ?? '').trim(),
        description: String(body.description ?? existing.description ?? '').trim(),
        category: String(body.category ?? existing.category ?? 'News').trim() || 'News',
        imageUrl: String(body.imageUrl ?? existing.imageUrl ?? '').trim(),
        author: String(body.author ?? existing.author ?? '').trim(),
        fontFamily: String(body.fontFamily ?? existing.fontFamily ?? 'Inter').trim() || 'Inter',
        fontSize: String(body.fontSize ?? existing.fontSize ?? '16px').trim() || '16px',
        color: String(body.color ?? existing.color ?? '#1d1d1f').trim() || '#1d1d1f',
        fontWeight: String(body.fontWeight ?? existing.fontWeight ?? 'normal').trim() || 'normal',
        fontStyle: String(body.fontStyle ?? existing.fontStyle ?? 'normal').trim() || 'normal',
        cardTitleFontFamily: String(body.cardTitleFontFamily ?? existing.cardTitleFontFamily ?? 'Inter').trim() || 'Inter',
        cardTitleFontSize: String(body.cardTitleFontSize ?? existing.cardTitleFontSize ?? '16px').trim() || '16px',
        cardTitleColor: String(body.cardTitleColor ?? existing.cardTitleColor ?? '#1d1d1f').trim() || '#1d1d1f',
        cardTitleFontWeight: String(body.cardTitleFontWeight ?? existing.cardTitleFontWeight ?? 'normal').trim() || 'normal',
        cardTitleFontStyle: String(body.cardTitleFontStyle ?? existing.cardTitleFontStyle ?? 'normal').trim() || 'normal',
        bodyHtml: String(body.bodyHtml ?? existing.bodyHtml ?? '').trim(),
        status,
        updatedAt: new Date().toISOString(),
      };
      if (status === 'published') {
        const fromDay = publishedAtFromDateOnly(publishedDateInput);
        if (fromDay) {
          updated.publishedAt = fromDay;
        } else if (!updated.publishedAt) {
          updated.publishedAt = defaultPublishedAtForNew();
        }
        if (!Number.isFinite(Number(updated.sortOrder))) {
          updated.sortOrder = 0;
          for (let i = 0; i < articles.length; i += 1) {
            if (i === index) continue;
            const a = articles[i];
            if (normalizeStatus(a && a.status) !== 'published') continue;
            const so = Number(a && a.sortOrder);
            if (Number.isFinite(so)) articles[i] = { ...a, sortOrder: so + 1 };
          }
        }
      } else {
        updated.publishedAt = null;
        delete updated.sortOrder;
      }
      articles[index] = updated;
      await saveArticles(env, articles);
      return new Response(JSON.stringify(updated), { status: 200, headers: CORS });
    } catch (e) {
      return new Response(JSON.stringify({ error: (e && e.message) || 'Error' }), { status: 500, headers: CORS });
    }
  }

  if (request.method === 'DELETE') {
    if (!canWrite(request, env)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS });
    }
    const articles = await loadArticles(env);
    const next = articles.filter((a) => String(a && a.id) !== id);
    await saveArticles(env, next);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: CORS });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
}
