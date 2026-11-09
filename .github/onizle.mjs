// Arama motoru sayfaları: siteyi gerçek bir tarayıcıda (gerçek verilerle) açar ve her ürün, kategori
// ve ana bölüm için içeriği önceden yazılmış bir sayfa üretir (dist/urun/....html gibi).
// Google ve paylaşım önizlemeleri (WhatsApp, Instagram) her sayfanın kendi başlığını, açıklamasını,
// resmini ve içeriğini görür. Ziyaretçi bu adrese gelince site açılır ve doğrudan o bölüme geçer.
// Ayrıca dist/sitemap.xml'i tüm adreslerle yeniden yazar ve IndexNow için adres listesini hazırlar.
// Bir sorun olursa yayını durdurmaz: sadece ana sayfa ile devam edilir.
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4' };
const srv = http.createServer((q, r) => {
  const p = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
}).listen(8898);

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
import crypto from 'node:crypto';
let tpl = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tplOrig = tpl;
// Sitenin büyük kodunu ve stilini ortak dosyalara ayır (her sayfa aynı dosyayı kullanır, tarayıcı önbellekte tutar)
function split(html) {
  const big = (re) => { let m, best = null; re.lastIndex = 0; while ((m = re.exec(html))) if (!best || m[1].length > best[1].length) best = m; return best; };
  const js = big(/<script>([\s\S]*?)<\/script>/g), css = big(/<style>([\s\S]*?)<\/style>/g);
  if (!js || js[1].length < 100000 || !css) return null;
  const h = (t) => crypto.createHash('md5').update(t).digest('hex').slice(0, 10);
  const jf = 'app-' + h(js[1]) + '.js', cf = 'app-' + h(css[1]) + '.css';
  fs.writeFileSync(path.join(root, jf), js[1]); fs.writeFileSync(path.join(root, cf), css[1]);
  return html.replace(js[0], () => '<script src="/' + jf + '"></script>').replace(css[0], () => '<link rel="stylesheet" href="/' + cf + '">');
}
const sp = split(tpl);
if (sp) { tpl = sp; fs.writeFileSync(path.join(root, 'index.html'), tpl); }
let urls = [];

try {
  const b = await chromium.launch(process.env.WF_CHROME ? { executablePath: process.env.WF_CHROME, args: ['--no-sandbox'] } : {});
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  if (process.env.WF_STUB) { // yalnız yerel deneme: Supabase yerine örnek veri
    const stub = fs.readFileSync(process.env.WF_STUB, 'utf8');
    await ctx.route('**/*supabase.co/**', (r) => r.request().url().includes('site_content') ? r.fulfill({ status: 200, contentType: 'application/json', body: '[{"data":' + stub + '}]' }) : r.fulfill({ status: 404, body: '' }));
  }
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => console.log('sayfa hatası:', e.message));
  await pg.goto('http://localhost:8898/index.html#ana', { waitUntil: 'load' });
  await pg.waitForFunction(() => window.__wfSeo && window.__wfSeo().ready, null, { timeout: 30000 });
  const { dom, items } = await pg.evaluate(() => window.__wfSeo());
  let n = 0;
  for (const it of items) {
    await pg.evaluate((h) => { location.hash = '#' + h; }, it.h);
    await pg.waitForTimeout(it.h.startsWith('urun-') ? 700 : 900);
    const d = await pg.evaluate(() => {
      const m = (s) => (document.head.querySelector(s) || {}).content || '';
      const main = document.getElementById('main');
      // önceden yazılan içerikte form ve videoların otomatik çalışmasını engelle
      const c = main.cloneNode(true);
      c.querySelectorAll('script,video,audio,iframe,canvas,input,textarea,select,form').forEach((x) => x.remove());
      c.querySelectorAll('img').forEach((x) => { if ((x.getAttribute('src') || '').startsWith('data:') && x.getAttribute('src').length > 3000) x.removeAttribute('src'); });
      return { title: document.title, desc: m('meta[name=description]'), robots: m('meta[name=robots]'), ld: (document.getElementById('ldjson') || {}).textContent || '', main: c.innerHTML, txt: main.innerText.length };
    });
    if (d.txt < 20 || /noindex/.test(d.robots)) continue;
    const url = dom + '/' + it.path;
    let img = it.img || '';
    if (!/^(https?:\/\/|[a-z0-9_-]+\/)/i.test(img)) img = ''; // builtin:, data: gibi resimler paylaşımda kullanılamaz
    else if (!/^https?:/.test(img)) img = dom + '/' + img.replace(/^\/+/, '');
    if (!img) img = dom + '/assets/wolflano-paylasim.jpg';
    const head = [
      '<base href="/">',
      `<script>if(!location.hash)history.replaceState(null,'','/#${it.h}')</script>`,
      `<title>${esc(d.title)}</title>`,
      `<meta name="description" content="${esc(d.desc)}">`,
      `<link rel="canonical" href="${esc(url)}">`,
      `<meta property="og:url" content="${esc(url)}">`,
      `<meta property="og:title" content="${esc(d.title)}">`,
      `<meta property="og:description" content="${esc(d.desc)}">`,
      `<meta property="og:image" content="${esc(img)}">`,
      `<meta property="og:type" content="${it.h.startsWith('urun-') ? 'product' : 'website'}">`,
      d.ld ? `<script type="application/ld+json" id="ldjson">${d.ld.replace(/</g, '\\u003c')}</script>` : ''
    ].join('');
    let html = tpl
      .replace(/<title>[^<]*<\/title>/, '')
      .replace(/<meta name="description"[^>]*>/, '')
      .replace(/<link rel="canonical"[^>]*>/, '')
      .replace(/<meta property="og:(url|title|description|image|image:width|image:height|type)"[^>]*>/g, '')
      .replace(/<head>/, '<head>' + head)
      .replace(/<main id="main"><\/main>/, '<main id="main">' + d.main + '</main>');
    if (it.path) {
      const f = path.join(root, it.path + '.html');
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, html);
      n++;
    }
    urls.push(url);
  }
  // Ürünün adı değişince eski adresi (urun/eski-ad-KOD) yeni adrese kalıcı yönlendir; Google 404 görmesin
  const ht = path.join(root, '.htaccess');
  if (fs.existsSync(ht)) {
    const rx = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const R = ['# Eski / değişmiş adresler (yayında otomatik yazılır)',
      'RewriteCond %{THE_REQUEST} \\s/index\\.html[\\s?]',
      'RewriteRule ^ / [R=301,L]',
      'RewriteCond %{THE_REQUEST} \\s/(?!studyo\\.html|google[0-9a-f]+\\.html)([^?\\s]+?)\\.html[\\s?]',
      'RewriteRule ^ /%1 [R=301,L]',
      'RewriteRule ^(shop|magaza|urunler)/?$ /hazir-urunler [R=301,L]',
      'RewriteRule ^(product|product-category|urun-kategori|kategori-urun)/ /hazir-urunler [R=301,L]',
      'RewriteRule ^(cart|sepet|checkout|odeme|my-account|hesabim)/?$ / [R=301,L]'];
    for (const it of items) {
      const m = /^urun\/(.+)-([a-z0-9]+)$/.exec(it.path || '');
      if (m) R.push(`RewriteRule ^urun/(?!${rx(m[1])}-${m[2]}$)[^/]*-${m[2]}/?$ /${it.path} [R=301,L]`);
    }
    let t = fs.readFileSync(ht, 'utf8');
    const k = '# Arama motoru sayfaları:';
    if (t.includes(k)) { t = t.replace(k, () => R.join('\n') + '\n' + k); fs.writeFileSync(ht, t); console.log('Yönlendirme: ' + (R.length - 8) + ' ürün adresi'); }
  }
  if (sp) { // ayrılmış ana sayfayı dene; sorun varsa eski tek dosya hâline dön
    const errs = []; const t = await ctx.newPage(); t.on('pageerror', (e) => errs.push(e.message));
    await t.goto('http://localhost:8898/index.html#hazir', { waitUntil: 'load' }); await t.waitForTimeout(3000);
    const len = await t.$eval('#main', (e) => e.innerText.length).catch(() => 0);
    if (errs.length || len < 50) { console.log('Ortak dosya denemesi başarısız, tek dosyaya dönülüyor:', errs.join(' | ')); throw new Error('split'); }
  }
  await b.close();
  console.log('Arama motoru sayfaları: ' + n + ' sayfa üretildi.');
} catch (e) {
  console.log('Arama motoru sayfaları üretilemedi (yayın sürüyor):', e.message);
  fs.writeFileSync(path.join(root, 'index.html'), tplOrig);
  for (const d of ['urun', 'kategori', 'sayfa']) fs.rmSync(path.join(root, d), { recursive: true, force: true });
  for (const f of ['hazir-urunler', 'baski-atolyesi', 'kendin-tasarla', 'hakkimizda', 'yorumlar', 'baski-fiyatlari', 'kurdun-izinde', 'iletisim']) fs.rmSync(path.join(root, f + '.html'), { force: true });
  urls = [];
}
srv.close();

if (!urls.length) urls = ['https://wolflano.com.tr/'];
urls.push('https://wolflano.com.tr/studyo.html');
urls = [...new Set(urls)];
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(root, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => `  <url><loc>${esc(u)}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n</urlset>\n');
fs.writeFileSync('indexnow-urls.json', JSON.stringify(urls));
console.log('Site haritası: ' + urls.length + ' adres.');
