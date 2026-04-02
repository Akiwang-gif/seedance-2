// Route: /api/articles/:id (get/update/delete single article)
(function () {
  if (process.env.KV_REST_API_URL) return;
  var keys = Object.keys(process.env || {});
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].endsWith('_KV_REST_API_URL')) {
      process.env.KV_REST_API_URL = process.env[keys[i]];
      var tokenKey = keys[i].replace('_URL', '_TOKEN');
      process.env.KV_REST_API_TOKEN = process.env[tokenKey] || process.env.KV_REST_API_TOKEN;
      break;
    }
  }
})();

let kvStore = null;
function getStore() {
  if (kvStore) return kvStore;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { Redis } = require('@upstash/redis');
      const upstash = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      kvStore = {
        get: async (key) => await upstash.get(key),
        set: async (key, val) => await upstash.set(key, typeof val === 'string' ? val : JSON.stringify(val)),
      };
      return kvStore;
    } catch (e) { /* ignore */ }
  }
  if (process.env.KV_REST_API_URL) {
    try {
      const kv = require('@vercel/kv').kv;
      kvStore = {
        get: async (key) => {
          const v = await kv.get(key);
          return v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v));
        },
        set: async (key, val) => { await kv.set(key, typeof val === 'string' ? val : JSON.stringify(val)); },
      };
      return kvStore;
    } catch (e) { /* ignore */ }
  }
  if (process.env.REDIS_URL) {
    let redisClient = null;
    const getClient = async () => {
      if (redisClient && redisClient.isReady) return redisClient;
      const { createClient } = require('redis');
      redisClient = createClient({
        url: process.env.REDIS_URL,
        socket: { connectTimeout: 15000 },
      });
      redisClient.on('error', () => { redisClient = null; });
      await redisClient.connect();
      return redisClient;
    };
    kvStore = {
      get: async (key) => {
        try {
          const c = await getClient();
          return await c.get(key);
        } catch (e) {
          redisClient = null;
          return null;
        }
      },
      set: async (key, val) => {
        try {
          const c = await getClient();
          await c.set(key, typeof val === 'string' ? val : JSON.stringify(val));
        } catch (e) {
          redisClient = null;
          throw e;
        }
      },
    };
    return kvStore;
  }
  return null;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const { requireWriteAuth } = require('../_lib/cms-auth');

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (ch) => { body += ch; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function normalizeStatus(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'draft' ? 'draft' : 'published';
}

async function getArticles() {
  const store = getStore();
  if (!store) return [];
  try {
    const raw = await store.get('cms_articles');
    if (raw == null) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (_) { return []; }
    }
    return [];
  } catch (e) {
    return [];
  }
}

async function setArticles(articles) {
  const store = getStore();
  await store.set('cms_articles', articles);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (!getStore()) {
    res.writeHead(503, CORS);
    res.end(JSON.stringify({ error: 'KV/Redis not configured. Add Vercel KV or Redis in Storage and connect to this project.' }));
    return;
  }

  const id = String((req.query && req.query.id) || '').trim();
  if (!id) {
    res.writeHead(400, CORS);
    res.end(JSON.stringify({ error: 'Article id is required' }));
    return;
  }

  if (req.method === 'GET') {
    const articles = await getArticles();
    const article = articles.find((a) => String(a && a.id) === id);
    if (!article) {
      res.writeHead(404, CORS);
      res.end(JSON.stringify({ error: 'Article not found' }));
      return;
    }
    if (normalizeStatus(article.status) === 'draft' && !requireWriteAuth(req, res)) return;
    res.writeHead(200, CORS);
    res.end(JSON.stringify(article));
    return;
  }

  if (req.method === 'PUT') {
    if (!requireWriteAuth(req, res)) return;
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (!ct.includes('application/json')) {
      res.writeHead(400, CORS);
      res.end(JSON.stringify({ error: 'Content-Type must be application/json' }));
      return;
    }
    try {
      const body = await parseBody(req);
      const articles = await getArticles();
      const index = articles.findIndex((a) => String(a && a.id) === id);
      if (index === -1) {
        res.writeHead(404, CORS);
        res.end(JSON.stringify({ error: 'Article not found' }));
        return;
      }
      const existing = articles[index];
      const status = normalizeStatus(body.status ?? existing.status);
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
        if (!updated.publishedAt) updated.publishedAt = new Date().toISOString();
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
      await setArticles(articles);
      res.writeHead(200, CORS);
      res.end(JSON.stringify(updated));
    } catch (e) {
      res.writeHead(500, CORS);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'DELETE') {
    if (!requireWriteAuth(req, res)) return;
    const articles = await getArticles();
    const next = articles.filter((a) => String(a && a.id) !== id);
    await setArticles(next);
    res.writeHead(200, CORS);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(405, CORS);
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
