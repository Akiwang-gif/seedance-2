// Server-rendered article page for crawlers and direct links: /article/:id
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

function hasCustomOrder(article) {
  return Number.isFinite(Number(article && article.sortOrder));
}

function compareArticles(a, b) {
  const aCustom = hasCustomOrder(a);
  const bCustom = hasCustomOrder(b);
  if (aCustom && bCustom) return Number(a.sortOrder) - Number(b.sortOrder);
  if (aCustom) return -1;
  if (bCustom) return 1;
  return (new Date(b.publishedAt || 0)) - (new Date(a.publishedAt || 0));
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeBodyHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
}

function plainTextExcerpt(article) {
  const source = article.description || article.bodyHtml || '';
  const clean = String(source).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Read this Seedance-2 article for the latest AI tools news and analysis.';
  return clean.length > 180 ? clean.slice(0, 177).trim() + '...' : clean;
}

module.exports = async (req, res) => {
  const rawId = req.query.id;
  const id = String(rawId || '').trim();
  if (!id) {
    res.writeHead(302, { Location: '/articles.html' });
    res.end();
    return;
  }

  // Always return 200 + SSR HTML here (no redirect). Redirect chains caused
  // Google Search Console "redirect error" for /article/:id when UA detection missed.

  const articles = (await getArticles()).slice().sort(compareArticles);
  const articleIndex = articles.findIndex((a) => String(a.id || '') === id);
  if (articleIndex === -1) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><head><meta charset="utf-8"><title>Article not found</title><meta name="robots" content="noindex,follow"></head><body><p>Article not found. <a href="/articles.html">Back to articles</a></p></body></html>');
    return;
  }

  const article = articles[articleIndex];
  const title = escapeHtml(article.title || 'Seedance-2 article');
  const description = escapeHtml(plainTextExcerpt(article));
  const imageUrl = escapeHtml(article.imageUrl || 'https://seedance-2.info/og-image.png');
  const canonicalUrl = 'https://seedance-2.info/article/' + encodeURIComponent(id);
  const publishedAtIso = article.publishedAt ? new Date(article.publishedAt).toISOString() : null;
  let publishedDisplay = '';
  if (article.publishedAt) {
    try {
      publishedDisplay = new Date(article.publishedAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch (e) {
      publishedDisplay = String(article.publishedAt);
    }
  }
  const bodyHtml = safeBodyHtml(article.bodyHtml || '');
  const prev = articles[articleIndex + 1] || null;
  const next = articles[articleIndex - 1] || null;

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title || 'Seedance-2 article',
    description: plainTextExcerpt(article),
    image: [article.imageUrl || 'https://seedance-2.info/og-image.png'],
    datePublished: publishedAtIso,
    dateModified: publishedAtIso,
    author: { '@type': 'Person', name: article.author || 'Seedance-2' },
    publisher: {
      '@type': 'Organization',
      name: 'Seedance-2',
      logo: { '@type': 'ImageObject', url: 'https://seedance-2.info/icon.png' },
    },
    mainEntityOfPage: canonicalUrl,
  };

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" type="image/png" href="/icon.png">
  <link rel="shortcut icon" href="/icon.png">
  <link rel="apple-touch-icon" href="/icon.png">
  <title>${title} · Seedance-2</title>
  <meta name="robots" content="index, follow">
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Seedance-2">
  <meta property="og:title" content="${title} · Seedance-2">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:image" content="${imageUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title} · Seedance-2">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  <script type="application/ld+json">${JSON.stringify(articleLd)}</script>
  <style>
    body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:860px;margin:0 auto;padding:2rem 1rem;color:#1d1d1f;line-height:1.7}
    a{color:#c0392b}
    .meta{color:#6e6e73;font-size:.92rem;margin:.6rem 0 1.4rem}
    .cat{display:inline-block;background:#f2f2f2;padding:.2rem .55rem;border-radius:8px;font-size:.78rem;margin-bottom:.8rem}
    .hero{max-width:100%;height:auto;border-radius:10px;margin:1rem 0 1.4rem}
    .content img{max-width:100%;height:auto;border-radius:8px}
    .nav{margin-top:2rem;padding-top:1rem;border-top:1px solid #eee;display:flex;justify-content:space-between;gap:1rem}
    .nav a{text-decoration:none}
  </style>
</head>
<body>
  <p><a href="/articles.html">← Back to articles</a> · <a href="/article.html?id=${encodeURIComponent(id)}">Open full layout</a></p>
  <span class="cat">${escapeHtml(article.category || 'News')}</span>
  <h1>${title}</h1>
  <p class="meta">${escapeHtml(article.author ? 'By ' + article.author + ' · ' : '')}${escapeHtml(publishedDisplay)}</p>
  ${article.imageUrl ? `<img class="hero" src="${imageUrl}" alt="${title}">` : ''}
  <article class="content">${bodyHtml || `<p>${description}</p>`}</article>
  <nav class="nav">
    <div>${prev ? `<a href="/article/${encodeURIComponent(String(prev.id || ''))}">Previous: ${escapeHtml(prev.title || 'Article')}</a>` : ''}</div>
    <div>${next ? `<a href="/article/${encodeURIComponent(String(next.id || ''))}">Next: ${escapeHtml(next.title || 'Article')}</a>` : ''}</div>
  </nav>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800');
  res.writeHead(200);
  res.end(html);
};
