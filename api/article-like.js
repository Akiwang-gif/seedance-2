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

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, CORS);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  if (!getStore()) {
    res.writeHead(503, CORS);
    res.end(JSON.stringify({ error: 'KV/Redis not configured' }));
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
    const id = String(body.id || '').trim();
    if (!id) {
      res.writeHead(400, CORS);
      res.end(JSON.stringify({ error: 'id is required' }));
      return;
    }
    const articles = await getArticles();
    const index = articles.findIndex((a) => String(a && a.id) === id);
    if (index === -1) {
      res.writeHead(404, CORS);
      res.end(JSON.stringify({ error: 'Article not found' }));
      return;
    }
    if (normalizeStatus(articles[index].status) !== 'published') {
      res.writeHead(403, CORS);
      res.end(JSON.stringify({ error: 'Article is not published' }));
      return;
    }
    const prev = Math.max(0, parseInt(articles[index].likeCount, 10) || 0);
    const likeCount = prev + 1;
    articles[index] = { ...articles[index], likeCount };
    await setArticles(articles);
    res.writeHead(200, CORS);
    res.end(JSON.stringify({ ok: true, id, likeCount }));
  } catch (e) {
    res.writeHead(500, CORS);
    res.end(JSON.stringify({ error: e.message }));
  }
};
