function xmlEscape(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeStatus(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'draft' ? 'draft' : 'published';
}

function lastmodIso(value) {
  if (value == null || value === '') return null;
  const t = new Date(value);
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString();
}

async function loadArticles(env) {
  if (!env || !env.CMS_KV || typeof env.CMS_KV.get !== 'function') return [];
  try {
    const raw = await env.CMS_KV.get('cms_articles', { type: 'json' });
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch (_) { return []; }
    }
    return [];
  } catch (_) {
    return [];
  }
}

function buildSitemapXml(base, staticUrls, articles) {
  const safeBase = String(base || 'https://www.seedance-2.info').replace(/\/$/, '');
  const staticXml = (Array.isArray(staticUrls) ? staticUrls : []).map((u) => {
    const path = String((u && u.path) || '/');
    const changefreq = String((u && u.changefreq) || 'weekly');
    const priority = String((u && u.priority) || '0.5');
    return [
      '  <url>',
      `    <loc>${xmlEscape(safeBase + path)}</loc>`,
      `    <changefreq>${xmlEscape(changefreq)}</changefreq>`,
      `    <priority>${xmlEscape(priority)}</priority>`,
      '  </url>',
    ].join('\n');
  }).join('\n');

  const articleXml = (Array.isArray(articles) ? articles : [])
    .filter((a) => a && a.id && normalizeStatus(a.status) === 'published')
    .map((a) => {
      const loc = `${safeBase}/article/${encodeURIComponent(String(a.id))}`;
      const lm = lastmodIso(a.publishedAt || a.updatedAt || null);
      return [
        '  <url>',
        `    <loc>${xmlEscape(loc)}</loc>`,
        lm ? `    <lastmod>${xmlEscape(lm)}</lastmod>` : '',
        '    <changefreq>weekly</changefreq>',
        '    <priority>0.8</priority>',
        '  </url>',
      ].filter(Boolean).join('\n');
    })
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

export async function buildSitemapResponse(env) {
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
    const articles = await loadArticles(env);
    const xml = buildSitemapXml(base, staticUrls, articles);
    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    });
  } catch (_) {
    const fallbackXml = buildSitemapXml(base, staticUrls, []);
    return new Response(fallbackXml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  }
}
