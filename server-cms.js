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

  // API: GET /api/articles
  if (req.method === 'GET' && (pathname === '/api/articles' || pathname === '/api/articles/')) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const articles = readArticles();
      res.end(JSON.stringify(articles));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: POST /api/articles (JSON or multipart with image upload)
  if (req.method === 'POST' && (pathname === '/api/articles' || pathname === '/api/articles/')) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const contentType = (req.headers['content-type'] || '').toLowerCase();
    const isMultipart = contentType.includes('multipart/form-data');

    try {
      let title = '', description = '', category = 'News', imageUrl = '', author = '';
      let fontFamily = '', fontSize = '', color = '', fontWeight = 'normal', fontStyle = 'normal';
      let cardTitleFontFamily = '', cardTitleFontSize = '', cardTitleColor = '', cardTitleFontWeight = 'normal', cardTitleFontStyle = 'normal';
      let bodyHtml = '';

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
      const publishedAt = new Date().toISOString();
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
        publishedAt,
      };
      if (bodyHtml) article.bodyHtml = bodyHtml;
      article.sortOrder = 0;
      const bumped = articles.map((a) => {
        const so = Number(a.sortOrder);
        if (Number.isFinite(so)) return { ...a, sortOrder: so + 1 };
        return a;
      });
      bumped.unshift(article);
      writeArticles(bumped);
      res.writeHead(201);
      res.end(JSON.stringify(articles[0]));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: /api/upload-image (POST = upload, GET = check)
  if (/^\/api\/upload-image\/?$/.test(pathname)) {
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
      res.end(JSON.stringify(article));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: PUT /api/articles/:id (update)
  if (req.method === 'PUT' && /^\/api\/articles\/[^/]+$/.test(pathname)) {
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
      let bodyHtml = String(body.bodyHtml ?? existing.bodyHtml ?? '').trim();
      if (bodyHtml) {
        const firstImgMatch = bodyHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (firstImgMatch && firstImgMatch[1] && (firstImgMatch[1].indexOf('/uploads/') === 0 || firstImgMatch[1].indexOf('http') === 0)) {
          imageUrl = firstImgMatch[1];
        }
      }
      const updated = {
        ...existing,
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
      };
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

  // Do not serve /api/* as static
  if (pathname.startsWith('/api/')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found', path: pathname }));
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
  console.log('  API:       GET/POST/PUT/DELETE /api/articles, GET/PUT /api/articles/:id, POST /api/upload-image');
});
