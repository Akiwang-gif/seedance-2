// Dynamic sitemap that includes all article detail URLs.
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

function xmlEscape(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Invalid dates would make toISOString() throw and break the whole sitemap (GSC: couldn't fetch). */
function lastmodIso(value) {
  if (value == null || value === '') return null;
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString();
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

function buildSitemapXml(base, staticUrls, articles) {
  const safeBase = String(base || 'https://www.seedance-2.info');
  const staticXml = (Array.isArray(staticUrls) ? staticUrls : []).map((u) => {
    const path = String((u && u.path) || '/');
    const changefreq = String((u && u.changefreq) || 'weekly');
    const priority = String((u && u.priority) || '0.5');
    return [
      '  <url>',
      '    <loc>' + xmlEscape(safeBase + path) + '</loc>',
      '    <changefreq>' + xmlEscape(changefreq) + '</changefreq>',
      '    <priority>' + xmlEscape(priority) + '</priority>',
      '  </url>',
    ].join('\n');
  }).join('\n');

  const articleXml = (Array.isArray(articles) ? articles : [])
    .filter((a) => a && a.id && normalizeStatus(a.status) === 'published')
    .map((a) => {
      let loc = null;
      try {
        loc = safeBase + '/article/' + encodeURIComponent(String(a.id));
      } catch (_) {
        return '';
      }
      const lm = lastmodIso(a.publishedAt || a.updatedAt || null);
      return [
        '  <url>',
        '    <loc>' + xmlEscape(loc) + '</loc>',
        lm ? '    <lastmod>' + xmlEscape(lm) + '</lastmod>' : '',
        '    <changefreq>weekly</changefreq>',
        '    <priority>0.8</priority>',
        '  </url>',
      ].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    staticXml,
    articleXml,
    '</urlset>',
    '',
  ].join('\n');
}

module.exports = async (req, res) => {
  const base = 'https://www.seedance-2.info';
  const staticUrls = [
    { path: '/', changefreq: 'daily', priority: '1.0' },
    { path: '/articles.html', changefreq: 'daily', priority: '0.9' },
    { path: '/generate.html', changefreq: 'weekly', priority: '0.8' },
    { path: '/about-us.html', changefreq: 'monthly', priority: '0.6' },
    { path: '/contact.html', changefreq: 'monthly', priority: '0.5' },
    { path: '/advertise.html', changefreq: 'monthly', priority: '0.5' },
    { path: '/privacy-policy.html', changefreq: 'yearly', priority: '0.4' },
    { path: '/terms-of-service.html', changefreq: 'yearly', priority: '0.4' },
  ];

  try {
    const articles = await getArticles();
    const xml = buildSitemapXml(base, staticUrls, articles);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.writeHead(200);
    res.end(xml);
  } catch (e) {
    // Never return 500 for sitemap; fallback to static URLs for crawler stability.
    const fallbackXml = buildSitemapXml(base, staticUrls, []);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    res.writeHead(200);
    res.end(fallbackXml);
  }
};
