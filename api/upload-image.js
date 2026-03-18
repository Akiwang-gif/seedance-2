const formidable = require('formidable');
const fs = require('fs');
const { put } = require('@vercel/blob');

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const form = new formidable.IncomingForm({ maxFileSize: 4 * 1024 * 1024 });
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields: fields || {}, files: files || {} });
    });
  });
}

function getFile(files, key) {
  const v = files[key];
  if (!v) return null;
  const f = Array.isArray(v) ? v[0] : v;
  return f && (f.filepath || f.path) ? f : null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, CORS);
    res.end(JSON.stringify({ error: 'Method not allowed. Use POST with multipart/form-data and field "image".' }));
    return;
  }
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (!ct.includes('multipart/form-data')) {
    res.writeHead(400, CORS);
    res.end(JSON.stringify({ error: 'Content-Type must be multipart/form-data' }));
    return;
  }
  try {
    const { files } = await parseMultipart(req);
    const file = getFile(files, 'image') || getFile(files, 'file');
    if (!file || !(file.filepath || file.path)) {
      res.writeHead(400, CORS);
      res.end(JSON.stringify({ error: 'No image file' }));
      return;
    }
    const path = file.filepath || file.path;
    const buffer = fs.readFileSync(path);
    const name = (file.originalFilename || file.name || 'image').toString().replace(/[^a-zA-Z0-9._-]/g, '_');
    const blobName = Date.now() + '_' + Math.random().toString(36).slice(2, 9) + '_' + name;
    const blob = await put(blobName, buffer, { access: 'private' });
    const proxyUrl = '/api/serve-blob?url=' + encodeURIComponent(blob.url);
    res.writeHead(200, CORS);
    res.end(JSON.stringify({ url: proxyUrl }));
  } catch (e) {
    res.writeHead(500, CORS);
    res.end(JSON.stringify({ error: e.message || 'Upload failed' }));
  }
};
