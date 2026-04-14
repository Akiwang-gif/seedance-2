/**
 * GET /api/media?u=<encoded https blob URL>
 * Proxies Vercel Blob images (optional BLOB_READ_WRITE_TOKEN for private stores).
 */
const { URL } = require('url');

const ALLOW = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }

  let u = '';
  try {
    const parsed = new URL(req.url || '/', 'http://localhost');
    u = String(parsed.searchParams.get('u') || '').trim();
  } catch (e) {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (!u || !ALLOW.test(u)) {
    res.writeHead(400).end('Invalid url');
    return;
  }

  const headers = {
    Accept: 'image/*,*/*;q=0.8',
  };
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    headers.Authorization = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
  }

  try {
    const r = await fetch(u, { headers, redirect: 'follow' });
    if (!r.ok) {
      res.writeHead(r.status).end();
      return;
    }
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    if (req.method === 'HEAD') {
      res.writeHead(200).end();
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.writeHead(200);
    res.end(buf);
  } catch (e) {
    res.writeHead(502).end();
  }
};
