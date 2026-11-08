// Site kontrol robotu: canlı siteyi iPhone ekranında bir müşteri gibi gezer, satışı durduran hataları arar.
// Sonuç: kontrol-sonuc/ klasörüne ekran görüntüleri ve rapor.json; hata varsa rapor e-postayla gider (kontrol-rapor fonksiyonu).
import { chromium, devices } from 'playwright';
import fs from 'fs';
import zlib from 'zlib';

const SITE = process.env.SITE || 'https://wolflano.com.tr/';
const OUT = 'kontrol-sonuc';
fs.mkdirSync(OUT, { recursive: true });
const sonuc = [];   // {adim, durum:'tamam'|'hata'|'uyari', not}
let shotN = 0;

// küçük test fotoğrafı (düz renkli PNG) — şablona fotoğraf yerleştirme denemesi için
function png(w, h, rgb) {
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = -1; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ -1) >>> 0; };
  const chunk = (typ, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(typ), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = rgb[0]; raw[i + 1] = (rgb[1] + y) & 255; raw[i + 2] = rgb[2]; } }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const FOTO = [];
for (let i = 0; i < 6; i++) { const f = `${OUT}/test-foto-${i}.png`; fs.writeFileSync(f, png(600, 800, [40 + i * 35, 90, 200 - i * 25])); FOTO.push(f); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'tr-TR' });
const page = await ctx.newPage();
const hatalar = [];
page.on('pageerror', (e) => hatalar.push('Sayfa hatası: ' + String(e.message || e).slice(0, 200)));
page.on('response', (r) => { const u = r.url(); if (r.status() >= 400 && !/favicon|google|gtag|analytics|facebook|tiktok|doubleclick|\/rest\/v1\/rpc\/wf_hit/.test(u) && !(r.status() === 401 && /auth\/v1\/user/.test(u))) hatalar.push(`Yüklenemedi (${r.status()}): ${u.slice(0, 140)}`); });

async function shot(ad) { shotN++; const f = `${OUT}/${String(shotN).padStart(2, '0')}-${ad}.png`; try { await page.screenshot({ path: f }); } catch (_) {} }
async function kirikGorsel() { return await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith('data:') && i.offsetParent !== null).map((i) => i.src.slice(0, 120))); }
async function adim(ad, fn) {
  const once = hatalar.length;
  try { const not = await fn(); const yeni = hatalar.splice(once); const kg = await kirikGorsel().catch(() => []);
    if (kg.length) yeni.push('Açılmayan görsel: ' + kg.slice(0, 3).join(' , '));
    sonuc.push({ adim: ad, durum: yeni.length ? 'uyari' : 'tamam', not: [not, ...yeni].filter(Boolean).join(' | ') });
  } catch (e) { const yeni = hatalar.splice(once); sonuc.push({ adim: ad, durum: 'hata', not: [String(e.message || e).split('\n')[0].slice(0, 220), ...yeni].join(' | ') }); }
  await shot(ad.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 30));
}
const git = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(1500); };

await adim('Ana sayfa', async () => { await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 45000 }); await page.waitForTimeout(4000); const t = await page.title(); if (!/wolflano/i.test(t)) throw new Error('Başlık beklenmedik: ' + t); });
await adim('Koleksiyon', async () => { await git('#hazir'); await page.waitForSelector('article.card', { timeout: 20000 }); const n = await page.locator('article.card').count(); if (n < 10) throw new Error('Koleksiyonda az ürün var: ' + n); return n + ' ürün kartı'; });
let urunHash = '';
await adim('Ürün sayfası', async () => { await page.locator('article.card a.ph').first().click(); await page.waitForTimeout(2500); urunHash = await page.evaluate(() => location.hash);
  if (!/^#urun-/.test(urunHash)) throw new Error('Ürün sayfası açılmadı');
  const ok = await page.evaluate(() => { const i = document.querySelector('#gal img'); return !!(i && i.complete && i.naturalWidth > 0); }); if (!ok) throw new Error('Ürün fotoğrafı görünmüyor'); return urunHash; });
await adim('Sepete ekle (kupa)', async () => {
  await git('#hazir'); await page.waitForSelector('article.card', { timeout: 15000 });
  const id = await page.evaluate(() => { const c = [...document.querySelectorAll('article.card')].find((a) => /KUPA/i.test(a.innerText) && a.querySelector('[data-add]')); return c ? c.querySelector('[data-add]').dataset.add : ''; });
  if (!id) throw new Error('Sepete eklenecek kupa bulunamadı');
  await page.locator(`[data-add="${id}"]`).first().click(); await page.waitForTimeout(1500);
  await git('#sepet'); const tx = await page.evaluate(() => document.body.innerText);
  if (/Sepetin boş/i.test(tx)) throw new Error('Ürün sepete eklenmedi'); return 'kupa sepette'; });
await adim('Ödeme sayfası', async () => { await git('#odeme'); const tx = await page.evaluate(() => document.body.innerText); if (/Sepetin boş/i.test(tx)) throw new Error('Ödeme sayfası sepeti boş görüyor'); if (!/Ödeme/i.test(tx)) throw new Error('Ödeme sayfası açılmadı'); const n = await page.locator('input').count(); if (n < 3) throw new Error('Ödeme formu eksik (' + n + ' alan)'); });
await adim('Baskı Atölyesi', async () => { await git('#tasarla'); await page.waitForTimeout(1500); const tx = await page.evaluate(() => document.body.innerText); if (!/Tasarla|Ürün seç/i.test(tx)) throw new Error('Atölye sayfası boş'); });
async function sayfaLink(re) { return await page.evaluate((s) => { const r = new RegExp(s, 'i'); const a = [...document.querySelectorAll('a[href^="#p-"]')].find((x) => r.test(x.textContent || '')); return a ? a.getAttribute('href') : ''; }, re); }
await adim('Hediye & Dekor', async () => { await git('#ana'); const h = await sayfaLink('hediye'); if (!h) throw new Error('Hediye & Dekor bağlantısı bulunamadı'); await git(h); await page.waitForTimeout(1500); const n = await page.locator('article.card').count(); if (n < 3) throw new Error('Hediye & Dekor sayfasında az ürün: ' + n); return n + ' ürün'; });
await adim('Toptan', async () => { await git('#ana'); const h = await sayfaLink('toptan'); if (!h) throw new Error('Toptan bağlantısı bulunamadı'); await git(h); await page.waitForTimeout(2500); const n = await page.locator('.ttcat button').count(); if (n < 3) throw new Error('Toptan kategorileri görünmüyor (' + n + ')'); return n + ' kategori'; });
await adim('Hesabım', async () => { await git('#hesabim'); const tx = await page.evaluate(() => document.body.innerText); if (!/Giriş yap|Üye ol|Hesabım/i.test(tx)) throw new Error('Hesabım sayfası açılmadı'); });

async function studyo(urun, ad) {
  await adim('Stüdyo · ' + ad, async () => {
    await page.goto(SITE + 'studyo.html?urun=' + urun, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(() => { try { localStorage.setItem('wf_studio_guide', '1'); } catch (_) {} });
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
    if (!(await page.locator('#stage').count())) throw new Error('Stüdyo açılmadı');
    await page.locator('nav button, .tabs button, button').filter({ hasText: /^\s*Şablon\s*$/ }).first().click().catch(() => {});
    await page.waitForTimeout(3500);
    const tp = await page.locator('[data-adtpl]').count(); if (tp < 2) throw new Error('Şablonlar yüklenmedi (' + tp + ')');
    // fotoğraflı şablon: seç, fotoğrafları ver, yerleşti mi bak
    const bt = page.locator('[data-adtpl]').filter({ hasText: /Fotoğraf/ }).first();
    if (await bt.count()) {
      const fc = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null);
      await bt.click(); const ch = await fc;
      if (!ch) throw new Error('Fotoğraflı şablonda fotoğraf seçme açılmadı');
      await ch.setFiles(FOTO.slice(0, ch.isMultiple() ? 6 : 1)); await page.waitForTimeout(9000);
      const tx = await page.evaluate(() => (document.getElementById('toast') || {}).textContent || '');
      if (!/yerleşti|eklendi|görünüm/i.test(tx)) throw new Error('Fotoğraflar şablona yerleşmedi: ' + tx.slice(0, 80));
      return tp + ' şablon, fotoğraf yerleşti';
    }
    return tp + ' şablon';
  });
}
await studyo('tee', 'tişört');
await studyo('mug', 'kupa');

await browser.close();
const bozuk = sonuc.filter((s) => s.durum !== 'tamam');
fs.writeFileSync(`${OUT}/rapor.json`, JSON.stringify({ zaman: new Date().toISOString(), site: SITE, sonuc }, null, 2));
const satir = sonuc.map((s) => `${s.durum === 'tamam' ? '✓' : s.durum === 'uyari' ? '!' : '✗'} ${s.adim}${s.not ? ' — ' + s.not : ''}`).join('\n');
console.log(satir);
fs.writeFileSync(`${OUT}/ozet.txt`, satir);
fs.writeFileSync(process.env.GITHUB_OUTPUT || '/dev/null', `bozuk=${bozuk.length}\n`, { flag: 'a' });
