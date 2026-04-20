const formidable = require('formidable');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { put } = require('@vercel/blob');
const { requireWriteAuth } = require('./_lib/cms-auth');

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

function sanitizeFilename(name) {
  const raw = String(name || 'image').trim() || 'image';
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
}

function getR2Config() {
  const accountId = String(process.env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = String(process.env.R2_BUCKET || process.env.CMS_UPLOAD_BUCKET || '').trim();
  const publicBase = String(process.env.CMS_UPLOAD_PUBLIC_BASE || '').trim().replace(/\/$/, '');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase };
}

async function putToR2(buffer, key, contentType) {
  const cfg = getR2Config();
  if (!cfg) return null;
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'application/octet-stream',
    }),
  );
  return `${cfg.publicBase}/${key}`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, CORS);
    res.end(JSON.stringify({ error: 'Method not allowed. Use POST with multipart/form-data and field "image".' }));
    return;
  }
  if (!requireWriteAuth(req, res)) return;
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
    const name = sanitizeFilename(file.originalFilename || file.name || 'image');
    const key = `articles/${Date.now()}_${randomSuffix()}_${name}`;
    const mime = String(file.mimetype || file.mimeType || 'application/octet-stream');

    const r2Url = await putToR2(buffer, key, mime);
    if (r2Url) {
      res.writeHead(200, CORS);
      res.end(JSON.stringify({ url: r2Url }));
      return;
    }

    const blobName = Date.now() + '_' + Math.random().toString(36).slice(2, 9) + '_' + name;
    const blob = await put(blobName, buffer, { access: 'public' });
    res.writeHead(200, CORS);
    res.end(JSON.stringify({ url: blob.url }));
  } catch (e) {
    const msg = (e && e.message) || String(e);
    res.writeHead(500, CORS);
    if (/suspended/i.test(msg)) {
      res.end(
        JSON.stringify({
          error:
            'Vercel Blob is unavailable. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, CMS_UPLOAD_PUBLIC_BASE on Vercel (same bucket as Cloudflare).',
        }),
      );
      return;
    }
    res.end(JSON.stringify({ error: msg || 'Upload failed' }));
  }
};
