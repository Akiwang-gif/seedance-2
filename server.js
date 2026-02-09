/**
 * Local dev server: forwards /api/video/submit and /api/video/status to SiliconFlow.
 * Run: SILICONFLOW_API_KEY=your_token node server.js
 * Then open index.html (or use a static server) and set VIDEO_API_BASE to http://localhost:3000
 */
const http = require('http');
const url = require('url');

const SILICONFLOW_BASE = 'https://api.siliconflow.cn/v1/video';
const PORT = process.env.PORT || 3000;
const TOKEN = process.env.SILICONFLOW_API_KEY;

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

function proxy(method, path, body, token) {
  const target = SILICONFLOW_BASE + path;
  return fetch(target, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200).end();
    return;
  }

  const path = url.parse(req.url || '').pathname || '';

  if (req.method === 'POST' && path === '/api/video/submit') {
    if (!TOKEN) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'SILICONFLOW_API_KEY not set' }));
      return;
    }
    try {
      const body = await parseBody(req);
      const data = await proxy('POST', '/submit', body, TOKEN);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message || 'Proxy error' }));
    }
    return;
  }

  if (req.method === 'POST' && path === '/api/video/status') {
    if (!TOKEN) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'SILICONFLOW_API_KEY not set' }));
      return;
    }
    try {
      const body = await parseBody(req);
      const data = await proxy('POST', '/status', body, TOKEN);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message || 'Proxy error' }));
    }
    return;
  }

  res.writeHead(404).end('Not found');
});

server.listen(PORT, () => {
  console.log('Video API proxy at http://localhost:' + PORT);
  console.log('  POST /api/video/submit');
  console.log('  POST /api/video/status');
  if (!TOKEN) console.warn('  Set SILICONFLOW_API_KEY to enable SiliconFlow.');
});
