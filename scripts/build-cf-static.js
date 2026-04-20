/**
 * 输出 Cloudflare Pages 静态目录 dist-cf/（不含 api/、server-cms、大体积本地素材）。
 * 与 functions/api 代理配合，可在不切 DNS 的情况下预览整站（API 仍走线上 Vercel）。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-cf');

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function main() {
  rmrf(OUT);
  fs.mkdirSync(OUT, { recursive: true });

  for (const name of fs.readdirSync(ROOT)) {
    if (!name.endsWith('.html')) continue;
    copyFile(path.join(ROOT, name), path.join(OUT, name));
  }

  for (const name of ['article-cover.js', 'article-likes.js', 'robots.txt', 'ads.txt', 'icon.png', 'og-image.png']) {
    const p = path.join(ROOT, name);
    if (fs.existsSync(p)) copyFile(p, path.join(OUT, name));
  }

  copyDir(path.join(ROOT, 'js'), path.join(OUT, 'js'));

  console.log('Wrote', OUT);
}

main();
