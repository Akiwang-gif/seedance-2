/**
 * Shared article helpers (aligned with api/articles.js) for Cloudflare native routes.
 */
export function normalizeStatus(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'draft' ? 'draft' : 'published';
}

export function publishedAtFromDateOnly(dateStr) {
  const m = String(dateStr || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString();
}

export function defaultPublishedAtForNew() {
  const d = new Date();
  return publishedAtFromDateOnly(
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  );
}

export function sortPublishedForPublic(articles) {
  return articles
    .filter((a) => normalizeStatus(a && a.status) === 'published')
    .sort((a, b) => {
      const aHasOrder = Number.isFinite(Number(a && a.sortOrder));
      const bHasOrder = Number.isFinite(Number(b && b.sortOrder));
      if (aHasOrder && bHasOrder) return Number(a.sortOrder) - Number(b.sortOrder);
      if (aHasOrder) return -1;
      if (bHasOrder) return 1;
      return new Date((b && b.publishedAt) || 0) - new Date((a && a.publishedAt) || 0);
    });
}

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(text, maxLen) {
  const s = String(text || '').trim();
  if (!s || s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim() + '…';
}

function isGenericAlt(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return true;
  return ['image', 'photo', 'picture', 'img', 'article image', 'article content image', 'article content illustration'].includes(t);
}

function buildImageAlt(title, index, total) {
  const cleanTitle = String(title || '').trim();
  if (cleanTitle) {
    if (total > 1) return `${cleanTitle} - supporting image ${index} of ${total}`;
    return `${cleanTitle} - supporting image`;
  }
  if (total > 1) return `Seedance-2 AI news article supporting image ${index} of ${total}`;
  return 'Seedance-2 AI news article supporting image';
}

function getAttr(tag, name) {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = tag.match(re);
  return m ? (m[2] || m[3] || m[4] || '') : '';
}

function setAttr(tag, name, value) {
  const escaped = String(value).replace(/"/g, '&quot;');
  const re = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  if (re.test(tag)) return tag.replace(re, ` ${name}="${escaped}"`);
  return tag.replace(/>$/, ` ${name}="${escaped}">`);
}

function normalizeAnchorTitle(href) {
  const link = String(href || '').trim();
  if (!link || link.startsWith('#')) return 'Jump to section on Seedance-2';
  if (/article\.html\?id=|\/article\//i.test(link)) return 'Read this related Seedance-2 article';
  if (link.startsWith('/') || /seedance-2\.info/i.test(link)) return 'Read more on Seedance-2';
  return 'Open external source for reference';
}

export function optimizeBodyHtml(bodyHtml, title) {
  let html = String(bodyHtml || '').trim();
  if (!html) return '';

  html = html.replace(/<h1(\s[^>]*)?>/gi, '<h2$1>').replace(/<\/h1>/gi, '</h2>');

  const imgTotal = (html.match(/<img\b/gi) || []).length;
  let imgIndex = 0;
  html = html.replace(/<img\b[^>]*>/gi, (imgTag) => {
    imgIndex += 1;
    let next = imgTag;
    const alt = getAttr(next, 'alt');
    if (isGenericAlt(alt)) next = setAttr(next, 'alt', buildImageAlt(title, imgIndex, imgTotal));
    if (!getAttr(next, 'loading')) next = setAttr(next, 'loading', 'lazy');
    if (!getAttr(next, 'decoding')) next = setAttr(next, 'decoding', 'async');
    return next;
  });

  html = html.replace(/<a\b[^>]*>/gi, (aTag) => {
    let next = aTag;
    if (!getAttr(next, 'title')) next = setAttr(next, 'title', normalizeAnchorTitle(getAttr(next, 'href')));
    if (/\btarget\s*=\s*("_blank"|'_blank'|_blank)/i.test(next) && !getAttr(next, 'rel')) {
      next = setAttr(next, 'rel', 'noopener noreferrer');
    }
    return next;
  });

  return html;
}

export function buildDescription(explicitDescription, title, bodyHtml) {
  const explicit = truncateText(explicitDescription, 160);
  if (explicit) return explicit;
  const fromBody = truncateText(stripTags(bodyHtml), 160);
  if (fromBody) return fromBody;
  const cleanTitle = String(title || '').trim();
  if (cleanTitle) return truncateText(`${cleanTitle} - latest Seedance AI tools news and analysis on Seedance-2.`, 160);
  return 'Latest Seedance AI tools news and analysis on Seedance-2.';
}

/** Same-origin proxy for Blob + R2 public URLs (see functions/api/media.js). */
export function proxyStorageUrlsInHtml(html) {
  if (!html) return html;
  return String(html).replace(
    /https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^"'>\s]+|https:\/\/[a-z0-9.-]+\.r2\.dev\/[^"'>\s]+/gi,
    (url) => {
      if (url.includes('/api/media?')) return url;
      return '/api/media?u=' + encodeURIComponent(url);
    },
  );
}

export function mapPublishedArticleForPublic(a) {
  const title = a.title || '';
  let bodyHtml = a.bodyHtml;
  if (bodyHtml) {
    bodyHtml = optimizeBodyHtml(bodyHtml, title);
    bodyHtml = proxyStorageUrlsInHtml(bodyHtml);
  }
  return { ...a, bodyHtml };
}

export async function loadArticles(env) {
  if (!env || !env.CMS_KV) return null;
  const raw = await env.CMS_KV.get('cms_articles', 'json');
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

export async function saveArticles(env, articles) {
  if (!env || !env.CMS_KV) throw new Error('CMS_KV missing');
  await env.CMS_KV.put('cms_articles', JSON.stringify(articles));
}
