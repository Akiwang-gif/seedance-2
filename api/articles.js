const { kv } = require('@vercel/kv');

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
  const raw = await kv.get('cms_articles');
  if (raw == null) return [];
  try { return Array.isArray(raw) ? raw : JSON.parse(raw); } catch { return []; }
}

async function setArticles(articles) {
  await kv.set('cms_articles', JSON.stringify(articles));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const articles = await getArticles();
      res.writeHead(200, CORS);
      res.end(JSON.stringify(articles));
    } catch (e) {
      res.writeHead(500, CORS);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'POST') {
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
