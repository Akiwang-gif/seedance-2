/**
 * CMS server: serves static site + admin API for articles.
 * Run: node server-cms.js
 * Then open http://localhost:5000 (homepage) and http://localhost:5000/admin.html (upload articles).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const formidable = require('formidable');

const PORT = process.env.PORT || 5000;

/** When CMS_WRITE_SECRET is set, require Authorization: Bearer for mutations (aligns with Vercel API). */
function checkWriteAuth(req, res) {
  const secret = String(process.env.CMS_WRITE_SECRET || '').trim();
  if (!secret) return true;
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (token === secret) return true;
  res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ error: 'Unauthorized. Paste the same API key as in admin, or unset CMS_WRITE_SECRET for local open dev.' }));
  return false;
}

const DATA_DIR = path.join(__dirname, 'data');
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ARTICLES_FILE)) fs.writeFileSync(ARTICLES_FILE, '[]', 'utf8');
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function readArticles() {
  ensureDataDir();
  const raw = fs.readFileSync(ARTICLES_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeArticles(articles) {
  ensureDataDir();
  fs.writeFileSync(ARTICLES_FILE, JSON.stringify(articles, null, 2), 'utf8');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (ch) => { body += ch; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function normalizeStatus(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'draft' ? 'draft' : 'published';
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
      return (new Date((b && b.publishedAt) || 0)) - (new Date((a && a.publishedAt) || 0));
    });
}

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '/', true);
  const pathname = parsed.pathname || '/';
  const p = pathname === '/' ? '/index.html' : pathname;

  // API: GET|POST /api/cms-verify — admin login gate (same behavior as Vercel api/cms-verify.js)
  if (/^\/api\/cms-verify\/?$/.test(pathname)) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    const secret = String(process.env.CMS_WRITE_SECRET || '').trim();
    if (!secret) {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true, noSecretRequired: true }));
      return;
    }
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (token !== secret) {
      res.writeHead(401);
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // API: GET /api/articles
  if (req.method === 'GET' && (pathname === '/api/articles' || pathname === '/api/articles/')) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const articles = readArticles();
      const scope = String((parsed.query && parsed.query.scope) || '').trim().toLowerCase();
      const includeAll = scope === 'all';
      if (includeAll && !checkWriteAuth(req, res)) return;
      const normalized = articles.map((a) => ({ ...a, status: normalizeStatus(a && a.status) }));
      res.end(JSON.stringify(includeAll ? normalized : sortPublishedForPublic(normalized)));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: POST /api/articles (JSON or multipart with image upload)
  if (req.method === 'POST' && (pathname === '/api/articles' || pathname === '/api/articles/')) {
    if (!checkWriteAuth(req, res)) return;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    const isMultipart = contentType.includes('multipart/form-data');

    try {
      let title = '', description = '', category = 'News', imageUrl = '', author = '';
      let fontFamily = '', fontSize = '', color = '', fontWeight = 'normal', fontStyle = 'normal';
      let cardTitleFontFamily = '', cardTitleFontSize = '', cardTitleColor = '', cardTitleFontWeight = 'normal', cardTitleFontStyle = 'normal';
      let bodyHtml = '';
      let status = 'published';

      if (isMultipart) {
        ensureDataDir();
        const form = new formidable.IncomingForm();
        form.uploadDir = UPLOADS_DIR;
        form.keepExtensions = true;
        form.maxFileSize = 10 * 1024 * 1024;
        const [fields, files] = await new Promise((resolve, reject) => {
          form.parse(req, (err, f, fileList) => {
            if (err) reject(err);
            else resolve([f || {}, fileList || {}]);
          });
        });
        const get = (obj, key) => {
          const v = obj[key];
          return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
        };
        const getFile = (obj, key) => {
          const v = obj[key];
          if (!v) return null;
          const f = Array.isArray(v) ? v[0] : v;
          return f && (f.size > 0 || f.filepath) ? f : null;
        };
        title = String(get(fields, 'title')).trim();
        description = String(get(fields, 'description')).trim();
        category = String(get(fields, 'category')).trim() || 'News';
        author = String(get(fields, 'author')).trim();
        fontFamily = String(get(fields, 'fontFamily')).trim() || 'Inter';
        fontSize = String(get(fields, 'fontSize')).trim() || '16px';
        color = String(get(fields, 'color')).trim() || '#1d1d1f';
        fontWeight = String(get(fields, 'fontWeight')).trim() || 'normal';
        fontStyle = String(get(fields, 'fontStyle')).trim() || 'normal';
        imageUrl = String(get(fields, 'imageUrl')).trim();
        cardTitleFontFamily = String(get(fields, 'cardTitleFontFamily')).trim() || 'Inter';
        cardTitleFontSize = String(get(fields, 'cardTitleFontSize')).trim() || '16px';
        cardTitleColor = String(get(fields, 'cardTitleColor')).trim() || '#1d1d1f';
        cardTitleFontWeight = String(get(fields, 'cardTitleFontWeight')).trim() || 'normal';
        cardTitleFontStyle = String(get(fields, 'cardTitleFontStyle')).trim() || 'normal';
        status = normalizeStatus(get(fields, 'status'));
        bodyHtml = String(get(fields, 'bodyHtml') || '').trim();
        if (bodyHtml) {
          const firstImgMatch = bodyHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
          if (firstImgMatch && firstImgMatch[1] && (firstImgMatch[1].indexOf('/uploads/') === 0 || firstImgMatch[1].indexOf('http') === 0)) {
            imageUrl = firstImgMatch[1];
          }
        }
        const file = getFile(files, 'image');
        const filepath = file && (file.filepath || file.path);
        if (filepath && fs.existsSync(filepath)) {
          const ext = path.extname(file.originalFilename || file.name || '') || '.jpg';
          const newName = Date.now() + '_' + Math.random().toString(36).slice(2, 9) + ext;
          const newPath = path.join(UPLOADS_DIR, newName);
          fs.renameSync(filepath, newPath);
          imageUrl = '/uploads/' + newName;
        }
      } else {
        if (!contentType.includes('application/json')) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Content-Type must be application/json or multipart/form-data' }));
          return;
        }
        const body = await parseBody(req);
        title = String(body.title ?? '').trim();
        description = String(body.description ?? '').trim();
        category = String(body.category ?? 'News').trim() || 'News';
        imageUrl = String(body.imageUrl ?? '').trim();
        author = String(body.author ?? '').trim();
        fontFamily = String(body.fontFamily ?? 'Inter').trim() || 'Inter';
        fontSize = String(body.fontSize ?? '16px').trim() || '16px';
        color = String(body.color ?? '#1d1d1f').trim() || '#1d1d1f';
        fontWeight = String(body.fontWeight ?? 'normal').trim() || 'normal';
        fontStyle = String(body.fontStyle ?? 'normal').trim() || 'normal';
        cardTitleFontFamily = String(body.cardTitleFontFamily ?? 'Inter').trim() || 'Inter';
        cardTitleFontSize = String(body.cardTitleFontSize ?? '16px').trim() || '16px';
        cardTitleColor = String(body.cardTitleColor ?? '#1d1d1f').trim() || '#1d1d1f';
        cardTitleFontWeight = String(body.cardTitleFontWeight ?? 'normal').trim() || 'normal';
        cardTitleFontStyle = String(body.cardTitleFontStyle ?? 'normal').trim() || 'normal';
        status = normalizeStatus(body.status);
        bodyHtml = String(body.bodyHtml ?? '').trim();
        if (bodyHtml) {
          const firstImgMatch = bodyHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
          if (firstImgMatch && firstImgMatch[1] && (firstImgMatch[1].indexOf('/uploads/') === 0 || firstImgMatch[1].indexOf('http') === 0)) {
            imageUrl = firstImgMatch[1];
          }
        }
      }

      const articles = readArticles();
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const nowIso = new Date().toISOString();
      const article = {
        id,
        title,
        description,
        category,
        imageUrl,
        author,
        fontFamily,
        fontSize,
        color,
        fontWeight,
        fontStyle,
        cardTitleFontFamily,
        cardTitleFontSize,
        cardTitleColor,
        cardTitleFontWeight,
        cardTitleFontStyle,
        status,
        likeCount: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
        publishedAt: status === 'published' ? nowIso : null,
      };
      if (bodyHtml) article.bodyHtml = bodyHtml;
      let next = articles.slice();
      if (status === 'published') {
        article.sortOrder = 0;
        next = next.map((a) => {
          if (normalizeStatus(a && a.status) !== 'published') return a;
          const so = Number(a && a.sortOrder);
          if (Number.isFinite(so)) return { ...a, sortOrder: so + 1 };
          return a;
        });
      }
      next.unshift(article);
      writeArticles(next);
      res.writeHead(201);
      res.end(JSON.stringify(article));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: /api/upload-image (POST = upload, GET = check)
  if (/^\/api\/upload-image\/?$/.test(pathname)) {
    if (req.method === 'POST' && !checkWriteAuth(req, res)) return;
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed. Use POST with multipart/form-data and field "image".' }));
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('multipart/form-data')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Content-Type must be multipart/form-data' }));
      return;
    }
    ensureDataDir();
    const form = new formidable.IncomingForm();
    form.uploadDir = UPLOADS_DIR;
    form.keepExtensions = true;
    form.maxFileSize = 10 * 1024 * 1024;
    form.parse(req, (err, fields, files) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      const getFile = (obj, key) => {
        const v = obj[key];
        if (!v) return null;
        const f = Array.isArray(v) ? v[0] : v;
        return f && (f.filepath || f.path) ? f : null;
      };
      const file = getFile(files, 'image') || getFile(files, 'file');
      const filepath = file && (file.filepath || file.path);
      if (!filepath || !fs.existsSync(filepath)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No image file' }));
        return;
      }
      const origName = (file.originalFilename || file.name || file.newFilename || '').toString();
      const ext = path.extname(origName) || '.jpg';
      const newName = Date.now() + '_' + Math.random().toString(36).slice(2, 9) + ext;
      const newPath = path.join(UPLOADS_DIR, newName);
      try {
        fs.renameSync(filepath, newPath);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: '/uploads/' + newName }));
    });
    return;
  }

  // API: GET /api/articles/:id
  if (req.method === 'GET' && /^\/api\/articles\/[^/]+$/.test(pathname)) {
    const id = pathname.replace(/^\/api\/articles\//, '');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const articles = readArticles();
      const article = articles.find((a) => a.id === id);
      if (!article) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Article not found' }));
        return;
      }
      if (normalizeStatus(article.status) === 'draft' && !checkWriteAuth(req, res)) return;
      res.end(JSON.stringify(article));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: PUT /api/articles/:id (update)
  if (req.method === 'PUT' && /^\/api\/articles\/[^/]+$/.test(pathname)) {
    if (!checkWriteAuth(req, res)) return;
    const id = pathname.replace(/^\/api\/articles\//, '');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Content-Type must be application/json' }));
      return;
    }
    try {
      const body = await parseBody(req);
      const articles = readArticles();
      const index = articles.findIndex((a) => a.id === id);
      if (index === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
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
      const status = normalizeStatus(body.status ?? existing.status);
      let bodyHtml = String(body.bodyHtml ?? existing.bodyHtml ?? '').trim();
      if (bodyHtml) {
        const firstImgMatch = bodyHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (firstImgMatch && firstImgMatch[1] && (firstImgMatch[1].indexOf('/uploads/') === 0 || firstImgMatch[1].indexOf('http') === 0)) {
          imageUrl = firstImgMatch[1];
        }
      }
      const existingLikes = Math.max(0, parseInt(existing.likeCount, 10) || 0);
      let likeCount = existingLikes;
      if (body.likeCount !== undefined && body.likeCount !== null && body.likeCount !== '') {
        const n = parseInt(body.likeCount, 10);
        if (Number.isFinite(n) && n >= 0) likeCount = n;
      }
      const updated = {
        ...existing,
        likeCount,
        title,
        description,
        category,
        imageUrl,
        author,
        fontFamily,
        fontSize,
        color,
        fontWeight,
        fontStyle,
        cardTitleFontFamily,
        cardTitleFontSize,
        cardTitleColor,
        cardTitleFontWeight,
        cardTitleFontStyle,
        status,
        updatedAt: new Date().toISOString(),
      };
      if (status === 'published') {
        if (!updated.publishedAt) updated.publishedAt = new Date().toISOString();
      } else {
        updated.publishedAt = null;
        delete updated.sortOrder;
      }
      if (bodyHtml !== undefined) updated.bodyHtml = bodyHtml;
      articles[index] = updated;
      writeArticles(articles);
      res.end(JSON.stringify(updated));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: DELETE /api/articles/:id
  if (req.method === 'DELETE' && /^\/api\/articles\/[^/]+$/.test(pathname)) {
    if (!checkWriteAuth(req, res)) return;
    const id = pathname.replace(/^\/api\/articles\//, '');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const articles = readArticles().filter((a) => a.id !== id);
      writeArticles(articles);
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: POST /api/article-like — public like increment
  if (/^\/api\/article-like\/?$/.test(pathname)) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Content-Type must be application/json' }));
      return;
    }
    parseBody(req)
      .then((body) => {
        const id = String(body.id || '').trim();
        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'id is required' }));
          return;
        }
        const articles = readArticles();
        const index = articles.findIndex((a) => a.id === id);
        if (index === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'Article not found' }));
          return;
        }
        if (normalizeStatus(articles[index].status) !== 'published') {
          res.writeHead(403, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'Article is not published' }));
          return;
        }
        const prev = Math.max(0, parseInt(articles[index].likeCount, 10) || 0);
        const likeCount = prev + 1;
        articles[index] = { ...articles[index], likeCount };
        writeArticles(articles);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ ok: true, id, likeCount }));
      })
      .catch((e) => {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      });
    return;
  }

  // Do not serve /api/* as static
  if (pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: pathname }));
    return;
  }

  // Pretty URL: /article/:id → article.html (same as vercel.json rewrites)
  if (req.method === 'GET' && /^\/article\/[^/]+\/?$/.test(pathname)) {
    const articleHtmlPath = path.join(__dirname, 'article.html');
    fs.readFile(articleHtmlPath, (err, data) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Server error');
        return;
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(data);
    });
    return;
  }

  // Static files: serve from project root (strip leading / for path.join)
  const safePath = (p.split('?')[0] || '/').replace(/^\/+/, '') || 'index.html';
  const filePath = path.join(__dirname, safePath);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(500).end();
      return;
    }
    const ext = path.extname(filePath);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('');
    console.error('Port 5000 is already in use.');
    console.error('  - Close the other window running the CMS server, or');
    console.error('  - Find and kill the process:  netstat -ano | findstr :5000');
    console.error('    then:  taskkill /PID <PID> /F');
    console.error('');
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  ensureDataDir();
  console.log('CMS server running at http://localhost:' + PORT);
  console.log('  Run from:  ' + __dirname);
  console.log('  Homepage:  http://localhost:' + PORT + '/');
  console.log('  Admin:     http://localhost:' + PORT + '/admin.html');
  console.log('  Articles:  http://localhost:' + PORT + '/article/<id>  (pretty URL → article.html)');
  console.log('  API:       GET/POST/PUT/DELETE /api/articles, GET/PUT /api/articles/:id, POST /api/upload-image, POST /api/article-like');
});
