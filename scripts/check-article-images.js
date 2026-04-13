/**
 * One-off: fetch live /api/articles and print cover-related image URLs.
 * Run: node scripts/check-article-images.js
 */
const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

function firstImgSrc(html) {
  if (!html) return '';
  const m = String(html).match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1].trim() : '';
}

(async () => {
  const { status, body } = await get('https://www.seedance-2.info/api/articles');
  if (status !== 200) {
    console.log('HTTP', status);
    process.exit(1);
  }
  let articles;
  try {
    articles = JSON.parse(body);
  } catch (e) {
    console.log('Invalid JSON', e.message);
    process.exit(1);
  }
  if (!Array.isArray(articles)) {
    console.log('Not an array');
    process.exit(1);
  }
  console.log('Articles:', articles.length, '\n');
  const bad = [];
  const ok = [];
  for (const a of articles) {
    const id = a.id || '';
    const iu = String(a.imageUrl || '').trim();
    const fb = firstImgSrc(a.bodyHtml);
    const cover = fb || iu;
    const isBlob = /blob\.vercel-storage\.com|vercel-storage\.com/i.test(cover);
    const isApimart = /apimart\.ai/i.test(cover);
    const line = {
      id,
      imageUrl: iu ? iu.slice(0, 72) + (iu.length > 72 ? '…' : '') : '(empty)',
      firstBodySrc: fb ? fb.slice(0, 72) + (fb.length > 72 ? '…' : '') : '(none)',
      resolvedCover: cover ? cover.slice(0, 72) + (cover.length > 72 ? '…' : '') : '(none)',
      blob: isBlob,
      apimart: isApimart,
    };
    if (isApimart || (!cover && id)) bad.push(line);
    else ok.push(line);
  }
  console.log('=== Per article (first body img vs imageUrl) ===\n');
  for (const x of [...ok, ...bad].slice(0, 30)) {
    console.log('id:', x.id);
    console.log('  first body src:', x.firstBodySrc);
    console.log('  imageUrl field:', x.imageUrl);
    console.log('  effective cover (body first):', x.resolvedCover);
    console.log('  looks like Vercel Blob:', x.blob ? 'yes' : 'no');
    if (x.apimart) console.log('  WARNING: still contains apimart');
    console.log('');
  }
  if (bad.length) {
    console.log('=== Potential issues (apimart or empty cover):', bad.length, '===');
    bad.forEach((x) => console.log(x.id, x.apimart ? 'apimart' : 'empty'));
  } else {
    console.log('No apimart-only issues detected in resolved cover URLs (sample).');
  }

  const sampleUrl = firstImgSrc(articles[0] && articles[0].bodyHtml);
  if (sampleUrl && typeof fetch === 'function') {
    console.log('\n=== HEAD sample (first article, first body image) ===');
    console.log(sampleUrl);
    try {
      const r = await fetch(sampleUrl, { method: 'HEAD' });
      console.log('HTTP status:', r.status);
    } catch (e) {
      console.log('fetch error:', e.message);
    }
  }
})();
