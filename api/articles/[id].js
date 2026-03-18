let kv;
try {
  kv = require('@vercel/kv').kv;
} catch (e) {
  kv = null;
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
  if (!kv) return [];
  try {
    const raw = await kv.get('cms_articles');
    if (raw == null) return [];
    return Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
  } catch (e) {
    return [];
  }
}

async function setArticles(articles) {
  await kv.set('cms_articles', JSON.stringify(articles));
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
    if (!kv) {
      res.writeHead(503, CORS);
      res.end(JSON.stringify({ error: 'KV not configured. Add Vercel KV in Storage.' }));
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
      const description = String(body.description ?? existing.description ?? '').trim();
      const category = String(body.category ?? existing.category ?? 'News').trim() || 'News';
      let imageUrl = String(body.imageUrl ?? existing.imageUrl ?? '').trim();
      const author = String(body.author ?? existing.author ?? '').trim();
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
    if (!kv) {
      res.writeHead(503, CORS);
      res.end(JSON.stringify({ error: 'KV not configured. Add Vercel KV in Storage.' }));
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
