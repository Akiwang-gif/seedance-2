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
let storeType = null; // 'upstash' | 'kv' | 'redis' | null
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
      storeType = 'upstash';
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
      storeType = 'kv';
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
    storeType = 'redis';
    return kvStore;
  }
  storeType = null;
  return null;
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
const { requireWriteAuth } = require('./_lib/cms-auth');
const { proxyBlobUrlsInHtml } = require('./_lib/proxy-blob-urls');
const { URL } = require('url');

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

  // Keep article page with a single H1 by downgrading editor-inserted H1 tags.
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

function normalizeStatus(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'draft' ? 'draft' : 'published';
}

function publishedAtFromDateOnly(dateStr) {
  const m = String(dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString();
}

function defaultPublishedAtForNew() {
  const d = new Date();
  return publishedAtFromDateOnly(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  );
}

function sortPublishedForPublic(articles) {
  return articles
    .filter((a) => normalizeStatus(a && a.status) === 'published')
    .sort((a, b) => {
      const aHasOrder = Number.isFinite(Number(a && a.sortOrder));
      const bHasOrder = Number.isFinite(Number(b && b.sortOrder));
      if (aHasOrder && bHasOrder) return Number(a.sortOrder) - Number(b.sortOrder);
      if (aHasOrder) return -1;
      if (bHasOrder) return 1;
      return new Date(b && b.publishedAt || 0) - new Date(a && a.publishedAt || 0);
    });
}

function mapPublishedArticleForPublic(a) {
  const title = a.title || '';
  let bodyHtml = a.bodyHtml;
  if (bodyHtml) {
    bodyHtml = optimizeBodyHtml(bodyHtml, title);
    bodyHtml = proxyBlobUrlsInHtml(bodyHtml);
  }
  return { ...a, bodyHtml };
}

const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (req.method === 'GET') {
    const reqUrl = new URL(req.url || '/api/articles', 'http://localhost');
    const scope = String(reqUrl.searchParams.get('scope') || '').trim().toLowerCase();
    const includeAll = scope === 'all';
    if (includeAll && !requireWriteAuth(req, res)) return;

    const store = getStore();
    const articles = await getArticles();
    const normalized = articles.map((a) => ({
      ...a,
      status: normalizeStatus(a && a.status),
    }));
    const visible = includeAll ? normalized : sortPublishedForPublic(normalized);
    const payload = includeAll ? visible : visible.map(mapPublishedArticleForPublic);
    res.setHeader('X-Store', storeType || 'none');
    res.setHeader('X-Articles-Count', String(payload.length));
    res.setHeader('Access-Control-Expose-Headers', 'X-Store, X-Articles-Count');
    res.writeHead(200, CORS);
    res.end(JSON.stringify(payload));
    return;
  }

  if (req.method === 'PATCH') {
    if (!requireWriteAuth(req, res)) return;
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
      const ids = Array.isArray(body.ids) ? body.ids.map((v) => String(v || '').trim()).filter(Boolean) : [];
      if (!ids.length) {
        res.writeHead(400, CORS);
        res.end(JSON.stringify({ error: 'ids array is required' }));
        return;
      }
      const idPos = new Map();
      ids.forEach((id, idx) => idPos.set(id, idx));
      const articles = await getArticles();
      const included = articles
        .filter((a) => idPos.has(String(a.id || '')))
        .sort((a, b) => idPos.get(String(a.id || '')) - idPos.get(String(b.id || '')));
      const remaining = articles.filter((a) => !idPos.has(String(a.id || '')));
      const next = included.concat(remaining).map((a, idx) => ({ ...a, sortOrder: idx }));
      await setArticles(next);
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ ok: true, count: next.length }));
    } catch (e) {
      res.writeHead(500, CORS);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST') {
    if (!requireWriteAuth(req, res)) return;
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
      const articles = await getArticles();
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const status = normalizeStatus(body.status);
      const nowIso = new Date().toISOString();
      const publishedDateInput = String(body.publishedDate ?? '').trim();
      let publishedAt = null;
      if (status === 'published') {
        publishedAt = publishedAtFromDateOnly(publishedDateInput) || defaultPublishedAtForNew();
      }
      const article = {
        id, title, description, category, imageUrl, author,
        fontFamily, fontSize, color, fontWeight, fontStyle,
        cardTitleFontFamily, cardTitleFontSize, cardTitleColor, cardTitleFontWeight, cardTitleFontStyle,
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
        // 新发布稿置顶：旧已发布 sortOrder 顺延，草稿不参与顺延。
        next = next.map((a) => {
          if (normalizeStatus(a && a.status) !== 'published') return a;
          const so = Number(a && a.sortOrder);
          if (Number.isFinite(so)) return { ...a, sortOrder: so + 1 };
          return a;
        });
      }
      next.unshift(article);
      await setArticles(next);
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

handler.optimizeBodyHtml = optimizeBodyHtml;
handler.mapPublishedArticleForPublic = mapPublishedArticleForPublic;
module.exports = handler;
