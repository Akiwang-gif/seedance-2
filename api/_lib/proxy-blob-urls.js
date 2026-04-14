/**
 * Rewrite Vercel Blob public URLs to same-origin /api/media so images load when
 * direct blob requests return 403 (browser/WAF) while server-side fetch may succeed.
 */
const BLOB_HOST = /\.public\.blob\.vercel-storage\.com\//i;

function proxyBlobUrlsInHtml(html) {
  if (!html) return html;
  return String(html).replace(
    /https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^"'>\s]+/gi,
    (url) => {
      if (url.includes('/api/media?')) return url;
      return '/api/media?u=' + encodeURIComponent(url);
    },
  );
}

function proxyBlobSrcUrl(url) {
  const s = String(url || '').trim();
  if (!s || s.startsWith('/api/media?')) return s;
  if (!BLOB_HOST.test(s)) return s;
  return '/api/media?u=' + encodeURIComponent(s);
}

module.exports = { proxyBlobUrlsInHtml, proxyBlobSrcUrl, BLOB_HOST };
