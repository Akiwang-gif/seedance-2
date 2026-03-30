/**
 * CMS write protection for Vercel serverless routes.
 * Set CMS_WRITE_SECRET in project env; admin sends Authorization: Bearer <secret>.
 * On Vercel: mutations require a non-empty secret (503 if unset).
 * Local `vercel dev`: if unset, allow mutations (dev convenience); set secret to test prod behavior.
 */

function getWriteSecret() {
  return String(process.env.CMS_WRITE_SECRET || process.env.CMS_SECRET || '').trim();
}

function isVercelRuntime() {
  return !!process.env.VERCEL;
}

function isAuthorizedRequest(req) {
  const secret = getWriteSecret();
  if (!secret) {
    if (isVercelRuntime()) return false;
    return true;
  }
  const auth = req.headers && String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return token === secret;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function applyCors(res) {
  const h = corsHeaders();
  Object.keys(h).forEach((k) => res.setHeader(k, h[k]));
}

function rejectUnauthorized(res, jsonCors) {
  applyCors(res);
  res.writeHead(401, { 'Content-Type': 'application/json', ...jsonCors });
  res.end(JSON.stringify({
    error: 'Unauthorized. Provide Authorization: Bearer <CMS_WRITE_SECRET> (same value as in Vercel env).',
  }));
}

function rejectMisconfigured(res, jsonCors) {
  applyCors(res);
  res.writeHead(503, { 'Content-Type': 'application/json', ...jsonCors });
  res.end(JSON.stringify({
    error: 'Set CMS_WRITE_SECRET in Vercel project environment variables, then use that value in the admin API key field.',
  }));
}

/** Returns false and sends 401 or 503 when mutation must be refused. */
function requireWriteAuth(req, res) {
  if (isAuthorizedRequest(req)) return true;
  applyCors(res);
  if (!getWriteSecret() && isVercelRuntime()) {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Set CMS_WRITE_SECRET in Vercel project environment variables, then use that value in the admin API key field.',
    }));
    return false;
  }
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: 'Unauthorized. Provide Authorization: Bearer <CMS_WRITE_SECRET>.',
  }));
  return false;
}

module.exports = {
  getWriteSecret,
  isAuthorizedRequest,
  corsHeaders,
  applyCors,
  rejectUnauthorized,
  rejectMisconfigured,
  requireWriteAuth,
};
