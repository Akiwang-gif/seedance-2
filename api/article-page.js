// Server-render article detail HTML for better SEO/social crawlers.
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

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

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
      kvStore = { get: async (key) => await upstash.get(key) };
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
    };
    return kvStore;
  }
  return null;
}

function normalizeStatus(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'draft' ? 'draft' : 'published';
}

function hasCustomOrder(article) {
  return Number.isFinite(Number(article && article.sortOrder));
}
function compareArticles(a, b) {
  const aCustom = hasCustomOrder(a);
  const bCustom = hasCustomOrder(b);
  if (aCustom && bCustom) return Number(a.sortOrder) - Number(b.sortOrder);
  if (aCustom) return -1;
  if (bCustom) return 1;
  return (new Date((b && b.publishedAt) || 0)) - (new Date((a && a.publishedAt) || 0));
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
  } catch (_) {
    return [];
  }
}

function escAttr(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

function buildDescription(article) {
  const explicit = truncateText(article && article.description, 160);
  if (explicit) return explicit;
  const fromBody = truncateText(stripTags(article && article.bodyHtml), 160);
  if (fromBody) return fromBody;
  const fromTitle = truncateText((article && article.title ? String(article.title) + ' - ' : '') + 'AI video news and analysis from Seedance-2.', 160);
  return fromTitle || 'Open this Seedance-2 article for AI video news, Seedance platform context, and industry analysis.';
}

function toAbsoluteUrl(base, urlLike) {
  const s = String(urlLike || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return base + s;
  return s;
}

function decodeUrlEntities(u) {
  return String(u || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function firstUrlFromSrcset(srcset) {
  if (!srcset) return '';
  const part = String(srcset).split(',')[0].trim();
  const m = part.match(/^(\S+)/);
  return m ? decodeUrlEntities(m[1]) : '';
}

/** First real image in body: src (any form) or first candidate in srcset. */
function firstImageSrcFromBodyHtml(html) {
  if (!html) return '';
  const re = /<img\b[^>]*>/gi;
  const s = String(html);
  let m;
  while ((m = re.exec(s)) !== null) {
    const t = m[0];
    const d = t.match(/\bsrc\s*=\s*"([^"]*)"/i);
    const sq = t.match(/\bsrc\s*=\s*'([^']*)'/i);
    const uq = t.match(/\bsrc\s*=\s*([^\s>]+)/i);
    let u = '';
    if (d && d[1]) u = decodeUrlEntities(d[1]);
    else if (sq && sq[1]) u = decodeUrlEntities(sq[1]);
    else if (uq && uq[1]) u = decodeUrlEntities(uq[1]);
    if (!u) {
      const ss = t.match(/\bsrcset\s*=\s*"([^"]+)"/i) || t.match(/\bsrcset\s*=\s*'([^']+)'/i);
      if (ss && ss[1]) u = firstUrlFromSrcset(ss[1]);
    }
    if (u) return u;
  }
  return '';
}

function firstImageFromContentBlocks(blocks) {
  if (!Array.isArray(blocks)) return '';
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b && b.type === 'image' && b.url) return String(b.url).trim();
  }
  return '';
}

function replaceIdMeta(html, id, value) {
  const safe = escAttr(value);
  const re = new RegExp('(<meta[^>]*id="' + id + '"[^>]*content=")([^"]*)(")', 'i');
  if (re.test(html)) return html.replace(re, '$1' + safe + '$3');
  return html;
}

function injectBootstrap(html, payload) {
  const data = JSON.stringify(payload).replace(/</g, '\\u003c');
  const tag = '<script>window.__ARTICLE_BOOTSTRAP__=' + data + ';</script>';
  if (html.includes('<script src="/article-likes.js"></script>')) {
    return html.replace('<script src="/article-likes.js"></script>', tag + '\n    <script src="/article-likes.js"></script>');
  }
  return html.replace('</body>', tag + '\n</body>');
}

module.exports = async (req, res) => {
  const reqUrl = new URL(req.url || '/api/article-page', 'http://localhost');
  const id = String(reqUrl.searchParams.get('id') || '').trim();

  const htmlPath = path.join(process.cwd(), 'article.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  const base = 'https://www.seedance-2.info';

  const all = (await getArticles())
    .filter((a) => normalizeStatus(a && a.status) === 'published')
    .sort(compareArticles);
  const article = all.find((a) => String(a && a.id) === id) || null;
  const canonicalUrl = article ? (base + '/article/' + encodeURIComponent(String(article.id))) : (base + '/article/' + encodeURIComponent(id || ''));
  const pageTitle = article && article.title ? (article.title + ' · Seedance-2') : 'Seedance-2 News Article — AI Video Industry Coverage';
  const description = article ? buildDescription(article) : 'Open this Seedance-2 article for AI video news, Seedance platform context, and industry analysis. Learn what changed, who it affects, and what to watch next.';
  const coverSrc = article
    ? (String(article.imageUrl || '').trim()
      || firstImageSrcFromBodyHtml(article.bodyHtml)
      || firstImageFromContentBlocks(article.contentBlocks))
    : '';
  const image = article
    ? (toAbsoluteUrl(base, coverSrc) || (base + '/og-image.png'))
    : (base + '/og-image.png');

  html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + escAttr(pageTitle) + '</title>');
  html = html.replace(/(<meta\s+name="description"\s+content=")([^"]*)(")/i, '$1' + escAttr(description) + '$3');
  html = html.replace(/(<meta\s+name="robots"\s+content=")([^"]*)(")/i, '$1' + (article ? 'index, follow' : 'noindex, follow') + '$3');
  html = html.replace(/(<link[^>]*id="canonicalLink"[^>]*href=")([^"]*)(")/i, '$1' + escAttr(canonicalUrl) + '$3');
  html = html.replace(/(<link[^>]*id="altEn"[^>]*href=")([^"]*)(")/i, '$1' + escAttr(canonicalUrl) + '$3');
  html = html.replace(/(<link[^>]*id="altDefault"[^>]*href=")([^"]*)(")/i, '$1' + escAttr(canonicalUrl) + '$3');
  html = replaceIdMeta(html, 'ogTitle', pageTitle);
  html = replaceIdMeta(html, 'ogDescription', description);
  html = replaceIdMeta(html, 'ogUrl', canonicalUrl);
  html = replaceIdMeta(html, 'ogImage', image);
  html = replaceIdMeta(html, 'twitterTitle', pageTitle);
  html = replaceIdMeta(html, 'twitterDescription', description);
  html = replaceIdMeta(html, 'twitterImage', image);

  html = injectBootstrap(html, { id, article, all });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', article ? 'public, s-maxage=120, stale-while-revalidate=600' : 'public, s-maxage=30, stale-while-revalidate=120');
  res.writeHead(article ? 200 : 404);
  res.end(html);
};
