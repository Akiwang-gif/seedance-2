// 若连接 KV 时用了自定义前缀，复制到 @vercel/kv 需要的变量名
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

// 统一 store：优先 Upstash REST（serverless 友好），再 @vercel/kv，再 REDIS_URL + node-redis
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

async function getArticles() {
  const store = getStore();
  if (!store) return [];
  try {
    const raw = await store.get('cms_articles');
    if (raw == null) return [];
    return Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
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
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (req.method === 'GET') {
    const store = getStore();
    const articles = await getArticles();
    if (store) res.setHeader('X-Store', process.env.KV_REST_API_URL ? 'kv' : 'redis');
    else res.setHeader('X-Store', 'none');
    res.setHeader('X-Articles-Count', String(articles.length));
    res.writeHead(200, CORS);
    res.end(JSON.stringify(articles));
    return;
  }

  if (req.method === 'POST') {
    if (!getStore()) {
      res.writeHead(503, CORS);
      res.end(JSON.stringify({ error: 'KV/Redis not configured. Add Vercel KV or Redis in Storage and connect to this project.' }));
      return;
    }
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (!ct.includes('application/json')) {
      res.writeHead(400, CORS);
      res.end(JSON.stringify({ error: 'Content-Type must be application/json' }));
      return;
    }
    try {
      const body = await parseBody(req);
      const title = String(body.title ?? '').trim();
      const description = String(body.description ?? '').trim();
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
      if (bodyHtml) {
        const m = bodyHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m && m[1] && (m[1].includes('/') || m[1].startsWith('http'))) imageUrl = m[1];
      }
      const articles = await getArticles();
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const publishedAt = new Date().toISOString();
      const article = {
        id, title, description, category, imageUrl, author,
        fontFamily, fontSize, color, fontWeight, fontStyle,
        cardTitleFontFamily, cardTitleFontSize, cardTitleColor, cardTitleFontWeight, cardTitleFontStyle,
        publishedAt,
      };
      if (bodyHtml) article.bodyHtml = bodyHtml;
      articles.unshift(article);
      await setArticles(articles);
      res.writeHead(201, CORS);
      res.end(JSON.stringify(article));
    } catch (e) {
      res.writeHead(500, CORS);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(405, CORS);
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
