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
// Çerez bandı ve ziyaretçi anketi alttaki düğmeleri kapatmasın, robotun ziyareti istatistiğe de girmesin
await ctx.addInitScript(() => { try { localStorage.setItem('wf_cerez', 'hayir'); localStorage.setItem('wf_anket', 'bitti'); } catch (_) {} });
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
async function sayfaLink(re) { return await page.evaluate((s) => { const r = new RegExp(s, 'i'); const a = [...document.querySelectorAll('a[href^="#p-"]')].find((x) => r.test(x.textContent || '')); return a ? a.getAttribute('href') : ''; }, re); }
const git = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(1500); };

await adim('Fiyat ve kargo ayarları', async () => {
  const r = await fetch('https://api.wolflano.com.tr/rest/v1/site_content?select=data&id=eq.main', { headers: { apikey: 'sb_publishable_PP5xFd7ga61xaDOCHeET_Q_zfMaE_4G' } });
  const d = (await r.json())[0].data, sorun = [];
  (d.blanks || []).filter((b) => b.show !== false).forEach((b) => { if (!(+b.price > 0)) sorun.push('Fiyatı 0 olan baskısız ürün: ' + (b.name || b.id)); });
  (d.products || []).filter((p) => p.show !== false).forEach((p) => { if (!(+p.price > 0) && !(p.pc && p.pc.b)) sorun.push('Fiyatı 0 olan ürün: ' + (p.name || p.id)); });
  if (!d.ship || !(+d.ship.free >= 0)) sorun.push('Kargo ayarı eksik');
  if (sorun.length) throw new Error(sorun.slice(0, 6).join(' ; '));
  return 'kargo ' + d.ship.fee + ' ₺, ' + d.ship.free + ' ₺ üzeri ücretsiz';
});
// Aynı tasarım aynı renkte iki kez kaydedilmiş mi (kopya ürün)
await adim('Kopya ürün', async () => {
  const r = await fetch('https://api.wolflano.com.tr/rest/v1/site_content?select=data&id=eq.main', { headers: { apikey: 'sb_publishable_PP5xFd7ga61xaDOCHeET_Q_zfMaE_4G' } });
  const d = (await r.json())[0].data, by = {};
  // index.html'de gizlenen kopyalar (DEL_IDS) sayılmaz
  let gizli = []; try { const m = fs.readFileSync('index.html', 'utf8').match(/var DEL_IDS=(\[[^\]]*\])/); if (m) gizli = JSON.parse(m[1]); } catch (_) {}
  const imza = (p) => { const g = p.dsg || {}, A = g.assets || {}, s = [g.bid || '', g.cut || '', (p.cat || []).join(','), String(p.type || '')];
    ['front', 'back', 'logo', 'logo2'].forEach((k) => { const x = g[k]; if (!x || !(x.objs || []).length) return; s.push(k + ':' + (x.area || ''));
      x.objs.forEach((o) => { const a = o.assetId && A[o.assetId]; s.push([o.type, (a && (a.url || a.src)) || o.src || o.key || o.clip || o.shape || o.value || o.text || '', o.font || '', o.color || '', Math.round((+o.w || 0) / 20)].join('|')); }); });
    return s.join('#') + '@' + String(p.color || '').toLocaleLowerCase('tr'); };
  (d.products || []).filter((p) => p.show !== false && p.dsg && typeof p.dsg === 'object' && gizli.indexOf(p.id) < 0).forEach((p) => { const k = imza(p); (by[k] = by[k] || []).push(p); });
  const kopya = Object.values(by).filter((l) => l.length > 1);
  if (kopya.length) throw new Error(kopya.length + ' kopya: ' + kopya.slice(0, 5).map((l) => (l[0].name || l[0].id) + ' (' + (l[0].color || '') + ', ' + l.length + ' kez)').join(' ; '));
  return 'kopya yok';
});
// Bir sayfada aynı adlı ürün iki ayrı kartta mı (aynı tasarımın renkleri tek kartta olmalı)
async function ayniKart(hash, ad) {
  await adim(ad, async () => {
    await git(hash); await page.waitForTimeout(2500);
    for (let i = 0; i < 60; i++) { const b = page.locator('[data-kolmore]'); if (!(await b.count())) break; await b.first().click(); await page.waitForTimeout(500); }
    const ad2 = await page.evaluate(() => [...document.querySelectorAll('article.card')].map((c) => ((c.querySelector('.pnm') || {}).textContent || '').trim() + ' | ' + ((c.querySelector('.row small') || {}).textContent || '').trim()));
    const say = {}; ad2.forEach((x) => { say[x] = (say[x] || 0) + 1; });
    const cift = Object.entries(say).filter(([, n]) => n > 1);
    if (cift.length) throw new Error(cift.length + ' tasarım birden çok kartta: ' + cift.slice(0, 5).map(([k, n]) => k.split(' | ')[0] + ' (' + n + ' kart)').join(' ; '));
    return ad2.length + ' kart, tekrar yok';
  });
}
await adim('Ana sayfa', async () => { await page.goto(SITE, { waitUntil: 'domcontentloaded', timeout: 45000 }); await page.waitForTimeout(4000); const t = await page.title(); if (!/wolflano/i.test(t)) throw new Error('Başlık beklenmedik: ' + t); });
await adim('Koleksiyon', async () => { await git('#hazir'); await page.waitForSelector('article.card', { timeout: 20000 }); const n = await page.locator('article.card').count(); if (n < 10) throw new Error('Koleksiyonda az ürün var: ' + n); return n + ' ürün kartı'; });
let urunHash = '';
await ayniKart('#hazir', 'Koleksiyon · tekrar eden kart');
await ayniKart('#wolflano', 'Wolflano Koleksiyon · tekrar eden kart');
await adim('Ürün sayfası', async () => { await page.locator('article.card a.ph').first().click(); await page.waitForTimeout(2500); urunHash = await page.evaluate(() => location.hash);
  if (!/^#urun-/.test(urunHash)) throw new Error('Ürün sayfası açılmadı');
  const ok = await page.evaluate(() => { const i = document.querySelector('#gal img'); return !!(i && i.complete && i.naturalWidth > 0); }); if (!ok) throw new Error('Ürün fotoğrafı görünmüyor'); return urunHash; });
await adim('Sepete ekle (kupa)', async () => {
  await git('#ana'); const hd = await sayfaLink('hediye'); if (!hd) throw new Error('Hediye & Dekor bağlantısı bulunamadı'); await git(hd); await page.waitForSelector('article.card', { timeout: 15000 });
  // Kartlarda Sepete ekle düğmesi yok (gizli); müşteri gibi ürün sayfasına girip oradan ekle
  const href = await page.evaluate(() => { const c = [...document.querySelectorAll('article.card')].find((a) => /KUPA/i.test(a.innerText) && !a.querySelector('[data-soldout]')); const l = c && c.querySelector('a[href^="#urun-"]'); return l ? l.getAttribute('href') : ''; });
  if (!href) throw new Error('Sepete eklenecek kupa bulunamadı');
  await git(href); await page.waitForTimeout(1500);
  const btn = page.locator('[data-add]:visible').first(); if (!(await btn.count())) throw new Error('Ürün sayfasında Sepete ekle düğmesi yok');
  await btn.click(); await page.waitForTimeout(1500);
  await git('#sepet'); const tx = await page.evaluate(() => document.body.innerText);
  if (/Sepetin boş/i.test(tx)) throw new Error('Ürün sepete eklenmedi');
  // Aybüke'nin "hoş geldiniz" balonu sepette toplamın üstüne binmesin
  if (await page.locator('.ayb:visible').count()) throw new Error('Aybüke balonu sepette açık kalıyor (toplamı kapatıyor)');
  return 'kupa sepette'; });
await adim('Ödeme sayfası', async () => { await git('#odeme'); const tx = await page.evaluate(() => document.body.innerText); if (/Sepetin boş/i.test(tx)) throw new Error('Ödeme sayfası sepeti boş görüyor'); if (!/Ödeme/i.test(tx)) throw new Error('Ödeme sayfası açılmadı'); const n = await page.locator('input').count(); if (n < 3) throw new Error('Ödeme formu eksik (' + n + ' alan)'); });
await adim('Baskı Atölyesi', async () => { await git('#tasarla'); await page.waitForTimeout(1500); const tx = await page.evaluate(() => document.body.innerText); if (!/Tasarla|Ürün seç/i.test(tx)) throw new Error('Atölye sayfası boş'); });
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
// Stüdyo Grafikler: önizleme kartta küçük kalmasın (ne olduğu anlaşılsın)
await adim('Stüdyo · Grafikler önizleme', async () => {
  await page.goto(SITE + 'studyo.html?urun=tee', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => { try { localStorage.setItem('wf_studio_guide', '1'); } catch (_) {} });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
  await page.locator('#tabs [data-tab="tpl"]').click(); await page.waitForTimeout(1200);
  await page.locator('#apCats [data-ap="grf"]').click(); await page.waitForTimeout(3500);
  const r = await page.evaluate(() => { const out = []; let n = 0;
    document.querySelectorAll('#tplGrid .tpl').forEach((b) => { const pv = b.querySelector('.prev'), inn = b.querySelector('.in'); if (!pv || !inn || !inn.children.length) return; n++;
      const P = pv.getBoundingClientRect(); let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
      [...inn.children].forEach((c) => { const q = c.getBoundingClientRect(); if (!q.width && !q.height) return; x1 = Math.min(x1, q.left); y1 = Math.min(y1, q.top); x2 = Math.max(x2, q.right); y2 = Math.max(y2, q.bottom); });
      const w = x2 - x1, h = y2 - y1, ad = ((b.querySelector('span') || {}).textContent || '').trim();
      if (!(w > 0)) return;
      if (Math.max(w / P.width, h / P.height) < 0.6) out.push(ad + ' (küçük)');
      else if (x1 < P.left - 3 || x2 > P.right + 3 || y1 < P.top - 3 || y2 > P.bottom + 3) out.push(ad + ' (kesik)');
    }); return { n, out }; });
  if (r.n < 10) throw new Error('Grafikler yüklenmedi (' + r.n + ')');
  if (r.out.length) throw new Error(r.out.length + ' grafik önizlemesi bozuk: ' + r.out.slice(0, 6).join(' ; '));
  return r.n + ' grafik, önizlemeler düzgün';
});
// Stüdyo · giydir → ayır → yeniden giydir → kontur → kırp → kaydet → kayıttan aç (müşteri gibi, telefonda)
// Geçmiş hata: kayıtlı tasarım açılınca LANO'ya kontur verince WOLF'un resmi geliyordu; "Ayır" boş görsel getiriyordu.
await adim('Stüdyo · giydir, kontur, kaydet, aç', async () => {
  const objs = () => page.evaluate(() => [...document.querySelectorAll('#stage .obj[data-id]')].map((e) => { const r = e.getBoundingClientRect(); const i = e.querySelector('img'); return { id: e.dataset.id, text: /\btext\b/.test(e.className), cx: r.x + r.width / 2, cy: r.y + r.height / 2, src: i ? i.src : '' }; }));
  const toast = () => page.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.textContent : ''; });
  const bekle = async () => { const t0 = Date.now(); while (Date.now() - t0 < 20000) { const s = await toast(); if (!/…/.test(s)) return s; await page.waitForTimeout(300); } return toast(); };
  const btn = (c, t) => page.locator(`#ctxBar [data-c="${c}"]${t ? `[data-t="${t}"]` : ''}:visible`).first();
  const sec = async (id) => { const o = (await objs()).find((x) => x.id == id); if (!o) throw new Error('parça bulunamadı'); await page.mouse.click(o.cx, o.cy); await page.waitForTimeout(600); };
  const kaydir = async (id, dy) => { const o = (await objs()).find((x) => x.id == id); await page.mouse.move(o.cx, o.cy); await page.mouse.down(); for (let k = 1; k <= 8; k++) { await page.mouse.move(o.cx, o.cy + dy * k / 8); await page.waitForTimeout(30); } await page.mouse.up(); await page.waitForTimeout(500); };
  const desen = async (i, ne) => { await page.locator('.gych [data-gy="desen"]').click(); await page.waitForTimeout(1500);
    const z = page.locator('#zemGrid [data-zem]:visible').filter({ hasNot: page.locator('.zx') }); if ((await z.count()) <= i) throw new Error('Desenler yüklenmedi');
    await z.nth(i).click(); await page.waitForTimeout(1200); const t = await bekle(); if (!/yerleşti/.test(t)) throw new Error(ne + ' giydirilemedi: ' + t.slice(0, 80)); };
  const yazi = async (v, dy) => { await page.locator('#tabs [data-tab="text"]').click(); await page.waitForTimeout(500); await page.locator('#addText').click(); await page.waitForTimeout(500);
    await page.locator('#textIn').fill(v); await page.waitForTimeout(700); const o = (await objs()).filter((x) => x.text).pop(); if (!o) throw new Error('Yazı eklenmedi'); await kaydir(o.id, dy); return o.id; };
  const imza = (id) => page.evaluate(async (id) => { const e = document.querySelector('#stage .obj[data-id="' + id + '"] img'); if (!e) return null; await e.decode().catch(() => {}); if (!e.naturalWidth) return null;
    const c = document.createElement('canvas'); c.width = c.height = 24; const x = c.getContext('2d'); x.drawImage(e, 0, 0, 24, 24); const d = x.getImageData(0, 0, 24, 24).data; let s = ''; for (let i = 3; i < d.length; i += 4) s += d[i] > 60 ? '1' : '0'; return s; }, id);
  const benzer = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) if (a[i] === b[i]) m++; return m / a.length; };

  await page.goto(SITE + 'studyo.html?urun=tee', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.evaluate(() => { try { localStorage.setItem('wf_studio_guide', '1'); localStorage.removeItem('wf_sfav'); } catch (_) {} });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4500);
  await yazi('WOLF', -35); await btn('giydir', 'text').click(); await page.waitForTimeout(400); await desen(12, 'WOLF');
  await yazi('LANO', 35); await btn('giydir', 'text').click(); await page.waitForTimeout(400); await desen(30, 'LANO');
  let O = await objs(); if (O.length !== 2 || O.some((o) => o.text)) throw new Error('Giydirmeden sonra ' + O.length + ' parça');
  // WOLF: giydirilmiş parçayı yeniden giydir
  await sec(O[0].id); await btn('giydir', 'image').click(); await page.waitForTimeout(400); await desen(40, 'WOLF (yeniden)');
  // LANO: ayır, gevşek deseni sil, yazıyı yeniden giydir
  O = await objs(); await sec(O[1].id); await btn('tsplit').click(); await page.waitForTimeout(800);
  O = await objs(); if (O.length !== 3) throw new Error('Ayır çalışmadı (' + O.length + ' parça)');
  await btn('del').click(); await page.waitForTimeout(500);
  O = await objs(); const lt = O.find((o) => o.text); if (!lt) throw new Error('Ayırınca yazı geri gelmedi'); await sec(lt.id);
  await btn('giydir', 'text').click(); await page.waitForTimeout(400); await desen(50, 'LANO (yeniden)');
  // LANO: Kontur çok ince beyaz, sonra kare kırp
  O = await objs(); await sec(O[1].id); await btn('wout').click(); await page.waitForTimeout(500);
  await page.locator('#colorPop [data-wo="4"]').click(); await page.waitForTimeout(600); await bekle();
  await page.locator('#colorPop [data-woc="#ffffff"]').click(); await page.waitForTimeout(600); await bekle();
  await page.keyboard.press('Escape'); O = await objs(); await sec(O[1].id);
  // Kırp giydirilmiş parçada bilerek gizli (27.11 kararı); düğme görünüyorsa dene, gizliyse atla
  let kirp = 'kırp giydirilmişte kapalı';
  if (await btn('crop').count()) { await btn('crop').click(); await page.waitForTimeout(800); await page.locator('[data-crp="sq"]').click(); await page.waitForTimeout(300);
    await page.locator('[data-crp="ok"]').click(); await page.waitForTimeout(800); const kt = await bekle(); if (!/Kırpıldı/.test(kt)) throw new Error('Kırpma uygulanmadı: ' + kt.slice(0, 60)); kirp = 'kırp'; }
  O = await objs(); const once = []; for (const o of O) once.push(await imza(o.id));
  if (once.some((x) => !x)) throw new Error('Parçalardan biri görünmüyor (kaydetmeden önce)');
  // Kaydet ve kayıttan (Favoriler'deki gibi) yeniden aç
  await page.evaluate(() => document.getElementById('saveDesign').click()); await page.waitForTimeout(4000);
  const kayit = await page.evaluate(() => { try { const l = JSON.parse(localStorage.getItem('wf_sfav') || '[]'); const it = l[l.length - 1]; if (!it) return null;
    const ti = (it.data.front.objs[1] || {}).tsrc; return { id: it.id, ic: ti && ti.img && it.data.assets[ti.img.assetId] ? it.data.assets[ti.img.assetId].url : '' }; } catch (_) { return null; } });
  if (!kayit) throw new Error('Tasarım kaydedilemedi: ' + (await toast()).slice(0, 80));
  if (!kayit.ic) throw new Error('Kayıtta giydirilmiş yazının içindeki desen yok (açınca "Ayır" boş gelir)');
  await page.goto(SITE + 'studyo.html?fav=' + kayit.id, { waitUntil: 'domcontentloaded', timeout: 45000 }); await page.waitForTimeout(7000);
  const R = await objs(); if (R.length !== 2) throw new Error('Kayıttan açınca ' + R.length + ' parça (2 olmalı)');
  for (let i = 0; i < 2; i++) { const s = await imza(R[i].id); if (!s) throw new Error((i ? 'LANO' : 'WOLF') + ' açılınca görünmüyor'); if (benzer(s, once[i]) < benzer(s, once[1 - i]) || benzer(s, once[i]) < 0.9) throw new Error((i ? 'LANO' : 'WOLF') + ' açılınca başka parçanın resmini gösteriyor'); }
  // Açılan LANO'ya kontur: kendi resmi kalmalı
  await sec(R[1].id); await btn('wout').click(); await page.waitForTimeout(500); await page.locator('#colorPop [data-wo="1"]').click(); await page.waitForTimeout(800); await bekle(); await page.keyboard.press('Escape');
  const R2 = await objs(); const s2 = await imza(R2[1].id); if (!s2) throw new Error('Açılan LANO kontur verince kayboldu');
  if (benzer(s2, once[1]) < benzer(s2, once[0]) || benzer(s2, once[1]) < 0.9) throw new Error('Açılan LANO\'ya kontur verince başka parçanın (WOLF) resmi geldi');
  // Açılan LANO'yu ayır: içindeki kendi deseni gelmeli
  await sec(R2[1].id); await btn('tsplit').click(); await page.waitForTimeout(1500);
  const R3 = await objs(); const ic = R3.filter((o) => !o.text && o.id !== R2[0].id);
  if (!ic.length || !(await imza(ic[0].id))) throw new Error('Açılan LANO\'yu ayırınca içindeki desen boş geliyor');
  if (ic[0].src !== kayit.ic) throw new Error('Açılan LANO\'yu ayırınca başka bir görsel geliyor');
  await page.evaluate(() => { try { localStorage.removeItem('wf_sfav'); } catch (_) {} });
  return 'WOLF/LANO giydir, ayır, kontur, ' + kirp + ', kaydet, aç: düzgün';
});
await studyo('tee', 'tişört');
await studyo('mug', 'kupa');

await browser.close();
const bozuk = sonuc.filter((s) => s.durum !== 'tamam');
fs.writeFileSync(`${OUT}/rapor.json`, JSON.stringify({ zaman: new Date().toISOString(), site: SITE, sonuc }, null, 2));
const satir = sonuc.map((s) => `${s.durum === 'tamam' ? '✓' : s.durum === 'uyari' ? '!' : '✗'} ${s.adim}${s.not ? ' — ' + s.not : ''}`).join('\n');
console.log(satir);
fs.writeFileSync(`${OUT}/ozet.txt`, satir);
fs.writeFileSync(process.env.GITHUB_OUTPUT || '/dev/null', `bozuk=${bozuk.length}\n`, { flag: 'a' });
