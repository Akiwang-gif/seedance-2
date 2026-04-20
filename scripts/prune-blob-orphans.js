/**
 * List (and optionally delete) Vercel Blob objects not referenced by any CMS article.
 *
 * Requires BLOB_READ_WRITE_TOKEN and the same KV/Redis env as production (see vercel env pull).
 *
 * Usage:
 *   node scripts/prune-blob-orphans.js              # dry-run: print orphans + total size
 *   node scripts/prune-blob-orphans.js --delete    # delete orphans (irreversible)
 *
 * Optional:
 *   CMS_BEARER_TOKEN=xxx  — if set, fetches GET .../api/articles?scope=all (include drafts).
 *                         Otherwise only published articles from public API (risk: may delete blobs only in drafts).
 *
 *   ARTICLES_BASE=https://www.seedance-2.info   — override API origin
 *
 *   FORCE_PRUNE_ALL=1  — required with --delete if every blob would be deleted (safety guard).
 */

/* eslint-disable no-console */

(function loadEnvFile() {
  const fs = require('fs');
  const path = require('path');
  for (const name of ['.env.local', '.env']) {
    const p = path.join(__dirname, '..', name);
    if (!fs.existsSync(p)) continue;
    fs.readFileSync(p, 'utf8')
      .split('\n')
      .forEach((line) => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return;
        const i = t.indexOf('=');
        if (i <= 0) return;
        const k = t.slice(0, i).trim();
        let v = t.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) process.env[k] = v;
      });
    break;
  }
})();

(function kvEnvAlias() {
  if (process.env.KV_REST_API_URL) return;
  const keys = Object.keys(process.env || {});
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].endsWith('_KV_REST_API_URL')) {
      process.env.KV_REST_API_URL = process.env[keys[i]];
      const tokenKey = keys[i].replace('_URL', '_TOKEN');
      process.env.KV_REST_API_TOKEN = process.env[tokenKey] || process.env.KV_REST_API_TOKEN;
      break;
    }
  }
})();

const { list, del } = require('@vercel/blob');

function normalizeBlobUrl(u) {
  if (!u) return '';
  try {
    const x = new URL(String(u).trim());
    return x.origin + x.pathname;
  } catch (e) {
    return String(u).split('?')[0];
  }
}

function extractBlobUrlsFromString(s) {
  const out = [];
  if (!s) return out;
  const re = /https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^"'>\s]+/gi;
  let m;
  while ((m = re.exec(s)) !== null) out.push(m[0]);
  return out;
}

function addBlobFromAny(set, raw) {
  if (!raw || typeof raw !== 'string') return;
  let s = raw.trim();
  if (s.includes('/api/media')) {
    try {
      const base = s.startsWith('http') ? s : 'https://www.seedance-2.info' + (s.startsWith('/') ? s : '/' + s);
      const u = new URL(base);
      const inner = u.searchParams.get('u');
      if (inner) s = decodeURIComponent(inner);
    } catch (e) {
      return;
    }
  }
  if (/\.public\.blob\.vercel-storage\.com\//i.test(s)) {
    set.add(normalizeBlobUrl(s));
  }
}

function collectReferencedBlobUrls(articles) {
  const set = new Set();
  for (const a of articles) {
    if (!a) continue;
    addBlobFromAny(set, a.imageUrl);
    if (a.bodyHtml) {
      extractBlobUrlsFromString(a.bodyHtml).forEach((u) => addBlobFromAny(set, u));
    }
    if (Array.isArray(a.contentBlocks)) {
      for (const b of a.contentBlocks) {
        if (b && b.type === 'image' && b.url) addBlobFromAny(set, b.url);
      }
    }
  }
  return set;
}

async function getArticlesFromKv() {
  let kvStore = null;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const { Redis } = require('@upstash/redis');
    const upstash = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    kvStore = { get: async (key) => await upstash.get(key) };
  } else if (process.env.KV_REST_API_URL) {
    const kv = require('@vercel/kv').kv;
    kvStore = {
      get: async (key) => {
        const v = await kv.get(key);
        return v == null ? null : typeof v === 'string' ? v : JSON.stringify(v);
      },
    };
  } else if (process.env.REDIS_URL) {
    const { createClient } = require('redis');
    const c = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 15000 } });
    await c.connect();
    kvStore = {
      get: async (key) => await c.get(key),
    };
  }
  if (!kvStore) {
    return null;
  }
  const raw = await kvStore.get('cms_articles');
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (e) {
      return [];
    }
  }
  return [];
}

async function getArticlesViaHttp(scopeAll) {
  const https = require('https');
  const base = (process.env.ARTICLES_BASE || 'https://www.seedance-2.info').replace(/\/$/, '');
  const path = scopeAll ? '/api/articles?scope=all' : '/api/articles';
  const headers = {};
  if (scopeAll && process.env.CMS_BEARER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.CMS_BEARER_TOKEN}`;
  }
  return new Promise((resolve, reject) => {
    const req = https.request(
      base + path,
      { method: 'GET', headers },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error('HTTP ' + res.statusCode + ' ' + d.slice(0, 200)));
            return;
          }
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function listAllBlobs() {
  const all = [];
  let cursor;
  do {
    const r = await list({ limit: 1000, cursor });
    all.push(...(r.blobs || []));
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return all;
}

async function main() {
  const doDelete = process.argv.includes('--delete');

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('Missing BLOB_READ_WRITE_TOKEN. Run: vercel env pull  (or export the token)');
    process.exit(1);
  }

  let articles = await getArticlesFromKv();
  let source = 'kv';
  if (articles === null) {
    console.log('KV not configured or unavailable. Using HTTP…');
    const scopeAll = Boolean(process.env.CMS_BEARER_TOKEN);
    articles = await getArticlesViaHttp(scopeAll);
    source = scopeAll ? 'http:scope=all' : 'http:published-only';
  }

  const referenced = collectReferencedBlobUrls(articles);
  console.log('Articles source:', source, 'count:', articles.length);
  console.log('Referenced blob URLs (normalized):', referenced.size);

  const blobs = await listAllBlobs();
  console.log('Total blobs in store:', blobs.length);

  const orphans = blobs.filter((b) => {
    const n = normalizeBlobUrl(b.url);
    return !referenced.has(n);
  });

  if (
    doDelete &&
    orphans.length > 0 &&
    orphans.length === blobs.length &&
    !process.env.FORCE_PRUNE_ALL
  ) {
    console.error(
      'Refusing to delete every blob (no references matched). Set FORCE_PRUNE_ALL=1 if you really mean it.',
    );
    process.exit(1);
  }

  let bytes = 0;
  orphans.forEach((b) => {
    bytes += Number(b.size) || 0;
  });

  console.log('\nOrphans:', orphans.length, 'approx', Math.round(bytes / 1024), 'KB\n');
  orphans.slice(0, 50).forEach((b) => {
    console.log(b.pathname || b.url, '(' + (b.size || 0) + ' bytes)');
  });
  if (orphans.length > 50) console.log('… and', orphans.length - 50, 'more');

  if (!doDelete) {
    console.log('\nDry-run only. To delete, run: node scripts/prune-blob-orphans.js --delete');
    if (source === 'http:published-only') {
      console.warn(
        '\nWarning: only PUBLISHED articles were scanned. Blobs used only in DRAFTS may be listed as orphans. Set CMS_BEARER_TOKEN and use KV, or add token and use scope=all.',
      );
    }
    return;
  }

  if (orphans.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  const urls = orphans.map((b) => b.url);
  await del(urls);
  console.log('Deleted', urls.length, 'blob(s).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
