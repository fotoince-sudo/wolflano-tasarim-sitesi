// Yayın öncesi deneme: küçültülmüş sayfaları gerçek bir tarayıcıda telefon boyutunda açar.
// Herhangi bir sayfada JavaScript hatası çıkarsa yayın yapılmaz, site eski hâliyle kalır.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((q, r) => {
  const p = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
}).listen(8899);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const errs = [];
const pages = ['index.html#ana', 'index.html#hazir', 'index.html#atolye', 'index.html#sepet', 'index.html#sartlar', 'index.html#yonetim', 'studyo.html'];
for (const u of pages) {
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(u + ': ' + e.message));
  await p.goto('http://localhost:8899/' + u, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  if (u === 'studyo.html') {
    const n = await p.$$eval('#tabs button', x => x.length);
    if (n < 4) errs.push('studyo: araç çubuğu çizilmedi');
  } else {
    const t = await p.$eval('#main', e => e.innerText.length).catch(() => 0);
    if (t < 20) errs.push(u + ': sayfa boş');
  }
  await p.close();
}
await b.close(); srv.close();
if (errs.length) { console.error('HATA:\n' + errs.join('\n')); process.exit(1); }
console.log('Deneme tamam: ' + pages.length + ' sayfa hatasız açıldı.');
