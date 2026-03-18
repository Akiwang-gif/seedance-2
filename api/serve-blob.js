module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Access-Control-Allow-Origin': '*' }).end();
    return;
  }
  const url = req.url && req.url.includes('url=')
    ? decodeURIComponent((req.url.split('url=')[1] || '').split('&')[0])
    : null;
  if (!url || !url.startsWith('https://') || !url.includes('.blob.vercel-storage.com')) {
    res.writeHead(400, { 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Missing or invalid url' }));
    return;
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.writeHead(503, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Blob token not configured' }));
    return;
  }
  try {
    const resp = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!resp.ok) {
      res.writeHead(resp.status === 404 ? 404 : 502, { 'Access-Control-Allow-Origin': '*' }).end();
      return;
    }
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.writeHead(200);
    const { Readable } = require('stream');
    Readable.fromWeb(resp.body).pipe(res);
  } catch (e) {
    res.writeHead(500, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message || 'Failed to serve blob' }));
  }
};
