// Lightweight check: is Authorization Bearer equal to CMS_WRITE_SECRET? Used by admin gate only.
const { getWriteSecret, isAuthorizedRequest, applyCors } = require('./_lib/cms-auth');

function isVercel() {
  return !!process.env.VERCEL;
}

module.exports = async (req, res) => {
  applyCors(res);
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

  const secret = getWriteSecret();
  if (!secret) {
    if (isVercel()) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'CMS_WRITE_SECRET not configured on server' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, noSecretRequired: true }));
    return;
  }

  if (!isAuthorizedRequest(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
};
