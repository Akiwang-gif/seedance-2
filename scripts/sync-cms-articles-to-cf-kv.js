/**
 * Sync cms_articles from current API origin to Cloudflare KV.
 *
 * Usage:
 *   node scripts/sync-cms-articles-to-cf-kv.js                 # dry-run
 *   node scripts/sync-cms-articles-to-cf-kv.js --write         # write to KV
 *   node scripts/sync-cms-articles-to-cf-kv.js --write --verify
 */
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const KEY = 'cms_articles';

function loadEnvFiles() {
  for (const name of ['.cf.env', '.env.local', '.env']) {
    const p = path.join(__dirname, '..', name);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i <= 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function parseArgs() {
  const argv = process.argv.slice(2);
  return {
    write: argv.includes('--write'),
    verify: argv.includes('--verify'),
  };
}

function approxBytes(str) {
  return Buffer.byteLength(String(str || ''), 'utf8');
}

async function fetchArticles() {
  const base = String(
    process.env.API_PROXY_ORIGIN || process.env.ARTICLES_BASE || 'https://www.seedance-2.info',
  ).replace(/\/$/, '');
  const token = String(process.env.CMS_BEARER_TOKEN || '').trim();
  const scopeAll = !!token;
  const url = base + (scopeAll ? '/api/articles?scope=all' : '/api/articles');
  const headers = {};
  if (scopeAll) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Fetch articles failed: HTTP ${res.status} ${text.slice(0, 220)}`);
  }
  let data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON from ${url}: ${e.message}`);
  }
  if (!Array.isArray(data)) {
    throw new Error(`Expected array from ${url}, got ${typeof data}`);
  }
  return { data, base, scopeAll };
}

function requireForWrite(name) {
  if (!String(process.env[name] || '').trim()) {
    throw new Error(`Missing ${name}`);
  }
  return String(process.env[name]).trim();
}

async function kvPutValue(accountId, namespaceId, key, value, token) {
  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}` +
    `/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(key)}`;

  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body: value,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`KV PUT failed: HTTP ${res.status} ${text.slice(0, 260)}`);
  }
}

async function kvGetValue(accountId, namespaceId, key, token) {
  const endpoint =
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}` +
    `/storage/kv/namespaces/${encodeURIComponent(namespaceId)}/values/${encodeURIComponent(key)}`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`KV GET failed: HTTP ${res.status} ${text.slice(0, 260)}`);
  }
  return text;
}

async function main() {
  loadEnvFiles();
  const { write, verify } = parseArgs();
  const { data, base, scopeAll } = await fetchArticles();
  const serialized = JSON.stringify(data);
  const bytes = approxBytes(serialized);

  console.log('Source:', base, scopeAll ? '(scope=all)' : '(published-only)');
  console.log('Articles:', data.length);
  console.log('JSON size:', Math.round(bytes / 1024), 'KB');
  if (!scopeAll) {
    console.warn('Warning: scope=all not enabled. Set CMS_BEARER_TOKEN to include drafts.');
  }
  console.log('Sample IDs:', data.slice(0, 5).map((a) => a && a.id).filter(Boolean).join(', ') || '(none)');

  if (!write) {
    console.log('\nDry-run only. To write Cloudflare KV, run with --write');
    return;
  }

  const token = requireForWrite('CLOUDFLARE_API_TOKEN');
  const accountId = requireForWrite('CLOUDFLARE_ACCOUNT_ID');
  const namespaceId = requireForWrite('CMS_KV_NAMESPACE_ID');

  await kvPutValue(accountId, namespaceId, KEY, serialized, token);
  console.log(`\nWrote key "${KEY}" to Cloudflare KV namespace ${namespaceId}.`);

  if (verify) {
    const text = await kvGetValue(accountId, namespaceId, KEY, token);
    const arr = JSON.parse(text);
    console.log('Verify count:', Array.isArray(arr) ? arr.length : 'non-array');
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
