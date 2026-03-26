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

// 统一 store：优先 Upstash REST，再 @vercel/kv，再 REDIS_URL + node-redis（与 api/articles.js 一致）
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

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text, maxLen) {
  const s = String(text || '').trim();
  if (!s || s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

function isGenericAlt(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return true;
  return ['image', 'photo', 'picture', 'img', 'article image', 'article content image', 'article content illustration'].includes(t);
}

function buildImageAlt(title, index, total) {
  const cleanTitle = String(title || '').trim();
  if (cleanTitle) {
    if (total > 1) return `${cleanTitle} - supporting image ${index} of ${total}`;
    return `${cleanTitle} - supporting image`;
  }
  if (total > 1) return `Seedance-2 AI news article supporting image ${index} of ${total}`;
  return 'Seedance-2 AI news article supporting image';
}

function getAttr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = tag.match(re);
  return m ? (m[2] || m[3] || m[4] || '') : '';
}

function setAttr(tag, name, value) {
  const escaped = String(value).replace(/"/g, '&quot;');
  const re = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  if (re.test(tag)) return tag.replace(re, ` ${name}="${escaped}"`);
  return tag.replace(/>$/, ` ${name}="${escaped}">`);
}

function normalizeAnchorTitle(href) {
  const link = String(href || '').trim();
  if (!link || link.startsWith('#')) return 'Jump to section on Seedance-2';
  if (/article\.html\?id=|\/article\//i.test(link)) return 'Read this related Seedance-2 article';
  if (link.startsWith('/') || /seedance-2\.info/i.test(link)) return 'Read more on Seedance-2';
  return 'Open external source for reference';
}

function optimizeBodyHtml(bodyHtml, title) {
  let html = String(bodyHtml || '').trim();
  if (!html) return '';

  html = html.replace(/<h1(\s[^>]*)?>/gi, '<h2$1>').replace(/<\/h1>/gi, '</h2>');

  const imgTotal = (html.match(/<img\b/gi) || []).length;
  let imgIndex = 0;
  html = html.replace(/<img\b[^>]*>/gi, (imgTag) => {
    imgIndex += 1;
    let next = imgTag;
    const alt = getAttr(next, 'alt');
    if (isGenericAlt(alt)) next = setAttr(next, 'alt', buildImageAlt(title, imgIndex, imgTotal));
    if (!getAttr(next, 'loading')) next = setAttr(next, 'loading', 'lazy');
    if (!getAttr(next, 'decoding')) next = setAttr(next, 'decoding', 'async');
    return next;
  });

  html = html.replace(/<a\b[^>]*>/gi, (aTag) => {
    let next = aTag;
    if (!getAttr(next, 'title')) next = setAttr(next, 'title', normalizeAnchorTitle(getAttr(next, 'href')));
    if (/\btarget\s*=\s*("_blank"|'_blank'|_blank)/i.test(next) && !getAttr(next, 'rel')) {
      next = setAttr(next, 'rel', 'noopener noreferrer');
    }
    return next;
  });

  return html;
}

function buildDescription(explicitDescription, title, bodyHtml) {
  const explicit = truncateText(explicitDescription, 160);
  if (explicit) return explicit;
  const fromBody = truncateText(stripTags(bodyHtml), 160);
  if (fromBody) return fromBody;
  const cleanTitle = String(title || '').trim();
  if (cleanTitle) return truncateText(`${cleanTitle} - latest Seedance AI tools news and analysis on Seedance-2.`, 160);
  return 'Latest Seedance AI tools news and analysis on Seedance-2.';
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
  const id = req.query.id;
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (!id) {
    res.writeHead(400, CORS);
    res.end(JSON.stringify({ error: 'Missing id' }));
    return;
  }

  if (req.method === 'GET') {
    const articles = await getArticles();
    const article = articles.find((a) => a.id === id);
    if (!article) {
      res.writeHead(404, CORS);
      res.end(JSON.stringify({ error: 'Article not found' }));
      return;
    }
    res.writeHead(200, CORS);
    res.end(JSON.stringify(article));
    return;
  }

  if (req.method === 'PUT') {
    if (!getStore()) {
      res.writeHead(503, CORS);
      res.end(JSON.stringify({ error: 'KV/Redis not configured. Add Vercel KV or Redis in Storage.' }));
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
      const articles = await getArticles();
      const index = articles.findIndex((a) => a.id === id);
      if (index === -1) {
        res.writeHead(404, CORS);
        res.end(JSON.stringify({ error: 'Article not found' }));
        return;
      }
      const existing = articles[index];
      const title = String(body.title ?? existing.title ?? '').trim();
      let description = String(body.description ?? existing.description ?? '').trim();
      const category = String(body.category ?? existing.category ?? 'News').trim() || 'News';
      let imageUrl = String(body.imageUrl ?? existing.imageUrl ?? '').trim();
      const author = String(body.author ?? existing.author ?? '').trim();
      var parsedSortOrder = Number(body.sortOrder);
      const sortOrder = Number.isFinite(parsedSortOrder)
        ? parsedSortOrder
        : (Number.isFinite(Number(existing.sortOrder)) ? Number(existing.sortOrder) : null);
      const fontFamily = String(body.fontFamily ?? existing.fontFamily ?? 'Inter').trim() || 'Inter';
      const fontSize = String(body.fontSize ?? existing.fontSize ?? '16px').trim() || '16px';
      const color = String(body.color ?? existing.color ?? '#1d1d1f').trim() || '#1d1d1f';
      const fontWeight = String(body.fontWeight ?? existing.fontWeight ?? 'normal').trim() || 'normal';
      const fontStyle = String(body.fontStyle ?? existing.fontStyle ?? 'normal').trim() || 'normal';
      const cardTitleFontFamily = String(body.cardTitleFontFamily ?? existing.cardTitleFontFamily ?? 'Inter').trim() || 'Inter';
      const cardTitleFontSize = String(body.cardTitleFontSize ?? existing.cardTitleFontSize ?? '16px').trim() || '16px';
      const cardTitleColor = String(body.cardTitleColor ?? existing.cardTitleColor ?? '#1d1d1f').trim() || '#1d1d1f';
      const cardTitleFontWeight = String(body.cardTitleFontWeight ?? existing.cardTitleFontWeight ?? 'normal').trim() || 'normal';
      const cardTitleFontStyle = String(body.cardTitleFontStyle ?? existing.cardTitleFontStyle ?? 'normal').trim() || 'normal';
      let bodyHtml = String(body.bodyHtml ?? existing.bodyHtml ?? '').trim();
      if (bodyHtml) bodyHtml = optimizeBodyHtml(bodyHtml, title);
      description = buildDescription(description, title, bodyHtml);
      if (bodyHtml) {
        const m = bodyHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m && m[1] && (m[1].includes('/') || m[1].startsWith('http'))) imageUrl = m[1];
      }
      const updated = {
        ...existing,
        title, description, category, imageUrl, author,
        fontFamily, fontSize, color, fontWeight, fontStyle,
        cardTitleFontFamily, cardTitleFontSize, cardTitleColor, cardTitleFontWeight, cardTitleFontStyle,
      };
      if (sortOrder !== null) updated.sortOrder = sortOrder;
      if (bodyHtml !== undefined) updated.bodyHtml = bodyHtml;
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
    if (!getStore()) {
      res.writeHead(503, CORS);
      res.end(JSON.stringify({ error: 'KV/Redis not configured. Add Vercel KV or Redis in Storage.' }));
      return;
    }
    try {
      const articles = await getArticles();
      const next = articles.filter((a) => a.id !== id);
      if (next.length === articles.length) {
        res.writeHead(404, CORS);
        res.end(JSON.stringify({ error: 'Article not found' }));
        return;
      }
      await setArticles(next);
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, CORS);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(405, CORS);
  res.end(JSON.stringify({ error: 'Method not allowed' }));
};
