// Wolflano sunucusu: Supabase'in yerine TurkHosting'de çalışır. Site aynı adresleri (/rest/v1, /auth/v1, /storage/v1, /functions/v1) kullanır.
// Node 18 uyumu: fonksiyonların kullandığı web nesneleri
if (!globalThis.crypto) globalThis.crypto = require('crypto').webcrypto;
if (!globalThis.File) globalThis.File = require('buffer').File;
const http = require('http');
const crypto = require('crypto');
const { Readable } = require('stream');
const ayar = require('./ayar');
const db = require('./db');
const jwt = require('./jwt');
const { kurulum } = require('./kurulum');
const { sema, yukle } = require('./sema');
const { rest } = require('./rest');
const { auth } = require('./auth');
const { depo, tara } = require('./depo');
const { fonksiyon, JWT_GEREK, ADLAR } = require('./fonksiyonlar');

const SURUM = '1.0.0';
const bilgi = { surum: SURUM, basladi: new Date().toISOString(), kurulum: [], depo: null, hata: null };
const yerel = { serviceKey: '', jobToken: crypto.randomBytes(32).toString('hex') };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-upsert, prefer, accept, accept-profile, content-profile, range, x-wf-cart-key, x-wf-job-token, cache-control, x-supabase-api-version, x-retry-count',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, ETag, X-Total-Count',
  'Access-Control-Max-Age': '86400',
};

// ---------- başlatma ----------
const hazir = (async () => {
  try {
    bilgi.kurulum = await kurulum();
    let sec = process.env.JWT_SECRET;
    if (!sec) {
      const r = await db.owner.query("insert into public.wf_ayar(k, v) values ('jwt_secret', $1) on conflict (k) do nothing", [crypto.randomBytes(48).toString('hex')]);
      void r;
      sec = (await db.owner.query("select v from public.wf_ayar where k = 'jwt_secret'")).rows[0].v;
    }
    jwt.setSecret(sec);
    yerel.serviceKey = jwt.sign({ iss: 'wolflano', role: 'service_role', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 10 * 365 * 86400 });
    process.env.SUPABASE_URL = ayar.publicUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = yerel.serviceKey;
    process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_PP5xFd7ga61xaDOCHeET_Q_zfMaE_4G';
    process.env.WF_JOB_TOKEN = yerel.jobToken;
    await yukle();
    await db.apiKontrol();
    tara().then((s) => { bilgi.depo = s; }).catch((e) => { bilgi.depo = 'HATA: ' + e.message; });
    dinle();
  } catch (e) {
    bilgi.hata = e.message;
    console.error('baslatma', e);
  }
})();

// ---------- istek ----------
function claimsOf(headers) {
  const a = headers.get('authorization') || '';
  const tok = /^bearer /i.test(a) ? a.slice(7).trim() : '';
  if (!tok || !jwt.looksJwt(tok)) return { role: 'anon' };
  const p = jwt.verify(tok);
  if (!p) return { bad: 'invalid' };
  if (p.expired) return { bad: 'expired' };
  if (p.role !== 'authenticated' && p.role !== 'service_role') return { role: 'anon' };
  return p;
}

const jres = (status, o, h = {}) => new Response(o === null ? null : JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...h } });

function toResponse(r) {
  if (r.stream) {
    const s = r.stream();
    return new Response(s ? Readable.toWeb(s) : null, { status: r.status, headers: r.headers });
  }
  return new Response(r.body === undefined ? null : r.body, { status: r.status, headers: r.headers });
}

async function parseJson(request) {
  const t = await request.text();
  if (!t) return undefined;
  try { return JSON.parse(t); } catch { const e = new Error('bad json'); e.badJson = true; throw e; }
}

async function handle(request, ip) {
  const url = new URL(request.url);
  const p = url.pathname.replace(/\/{2,}/g, '/');
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });

  if (p === '/' || p === '/wf/durum') {
    await Promise.race([hazir, new Promise((r) => setTimeout(r, 8000))]);
    return jres(200, durum());
  }
  if (p === '/wf/gemini') return jres(200, await geminiDene());
  if (p === '/wf/uyan') { await hazir; zamanla().catch(() => {}); return jres(200, { ok: true }); }

  await hazir;
  if (bilgi.hata) return jres(503, { message: 'Sunucu başlatılamadı: ' + bilgi.hata });
  const claims = claimsOf(request.headers);
  let m;

  if ((m = /^\/functions\/v1\/([a-z0-9-]+)\/?$/.exec(p))) {
    const fn = fonksiyon(m[1]);
    if (!fn) return jres(404, { code: 'NOT_FOUND', message: 'Requested function was not found' });
    if (JWT_GEREK.has(m[1])) {
      const a = (request.headers.get('authorization') || '').replace(/^bearer /i, '').trim();
      const ok = (claims.role && !claims.bad && jwt.looksJwt(a)) || a === process.env.SUPABASE_ANON_KEY;
      if (!ok) return jres(401, { code: 401, message: claims.bad === 'expired' ? 'JWT expired' : 'Invalid JWT' });
    }
    const hdr = new Headers(request.headers);
    if (ip && !hdr.get('x-forwarded-for')) hdr.set('x-forwarded-for', ip);
    const init = { method, headers: hdr };
    if (method !== 'GET' && method !== 'HEAD') { init.body = await request.arrayBuffer(); }
    const r = await fn(new Request(request.url, init));
    return r instanceof Response ? r : jres(500, { message: 'fonksiyon yanıt vermedi' });
  }

  if (claims.bad && (p.startsWith('/rest/') || p.startsWith('/storage/'))) {
    return jres(401, { code: claims.bad === 'expired' ? 'PGRST303' : 'PGRST301', message: claims.bad === 'expired' ? 'JWT expired' : 'JWT could not be verified', details: null, hint: null });
  }
  const base = { method, params: url.searchParams, headers: request.headers, claims: claims.bad ? { role: 'anon' } : claims, ip };

  try {
    if ((m = /^\/rest\/v1\/(.+?)\/?$/.exec(p))) {
      const body = method === 'GET' || method === 'HEAD' || method === 'DELETE' ? undefined : await parseJson(request);
      return toResponse(await rest(base.claims, m[1], { ...base, body }));
    }
    if ((m = /^\/auth\/v1\/(.+?)\/?$/.exec(p))) {
      const body = method === 'POST' || method === 'PUT' ? await parseJson(request) : undefined;
      return toResponse(await auth(m[1], { ...base, body }));
    }
    if ((m = /^\/storage\/v1\/(.+?)\/?$/.exec(p))) {
      const jsonish = method === 'DELETE' || (method === 'POST' && /^object\/(sign|list)\//.test(m[1]));
      const body = jsonish ? await parseJson(request) : undefined;
      return toResponse(await depo(m[1], { ...base, body, raw: request }));
    }
  } catch (e) {
    if (e.badJson) return jres(400, { code: 'PGRST102', message: 'Gövde geçerli JSON değil', details: null, hint: null });
    console.error('istek', p, e);
    return jres(500, { message: 'Sunucu hatası', hata: String((e && e.message) || e).slice(0, 300) });
  }
  return jres(404, { message: 'Bu adres yok.' });
}

// Gemini anahtarı denemesi: hangi modeller açık, kısa bir soru cevaplanıyor mu (anahtar yazdırılmaz)
let geminiSon = 0, geminiSonuc = null;
async function geminiDene() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return { gemini: 'GEMINI_API_KEY girilmedi' };
  if (geminiSonuc && Date.now() - geminiSon < 15000) return geminiSonuc;
  const temiz = (t) => String(t).split(key).join('***').slice(0, 400);
  const out = {};
  try {
    const r = await disFetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    out.liste = r.status;
    if (r.ok) out.modeller = (j.models || []).map((m) => m.name.replace('models/', '')).filter((n) => /flash|tts|image/.test(n));
    else out.liste_hata = temiz(JSON.stringify(j.error || j));
  } catch (e) { out.liste_hata = temiz(e && (e.cause?.code || e.message) || e); }
  try {
    const r = await disFetch('https://generativelanguage.googleapis.com/v1beta/models/' + (process.env.GEMINI_CHAT_MODEL || 'gemini-3.8-flash') + ':generateContent', {
      method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Sadece "tamam" yaz.' }] }], generationConfig: { maxOutputTokens: 2000 } }),
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json().catch(() => ({}));
    out.deneme = r.status;
    out.cevap = r.ok ? (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || '').join('') : temiz(JSON.stringify(j.error || j));
  } catch (e) { out.deneme_hata = temiz(e && (e.cause?.code || e.message) || e); }
  geminiSon = Date.now(); geminiSonuc = out;
  return out;
}

function durum() {
  return {
    ad: 'Wolflano sunucusu', surum: bilgi.surum, basladi: bilgi.basladi,
    hazir: !bilgi.hata && sema.at > 0, hata: bilgi.hata,
    veritabani: sema.at ? `${sema.tables.size} tablo, ${sema.fns.size} fonksiyon` : 'bağlanamadı',
    site_kullanicisi: db.durum.apiHazir ? 'tamam' : 'YOK: ' + (db.durum.apiHata || 'API_DB_USER / API_DB_PASS girilmeli'),
    kurulum: Object.fromEntries(bilgi.kurulum),
    dosyalar: bilgi.depo,
    eposta: process.env.SMTP_PASS ? 'ayarlı' : 'SMTP_PASS girilmedi (üyelik ve sipariş e-postaları gitmez)',
    yapay_zeka: process.env.GEMINI_API_KEY ? 'Gemini ayarlı (deneme: /wf/gemini)' : process.env.OPENAI_API_KEY ? 'OpenAI ayarlı' : 'GEMINI_API_KEY girilmedi (Wolf ve Aybüke çalışmaz)',
    fonksiyonlar: ADLAR.length,
    adres: ayar.publicUrl,
  };
}

// Sunucu fonksiyonlarının kendi adresine (SUPABASE_URL) yaptığı istekler ağa çıkmadan doğrudan buraya gelir
const disFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (typeof u === 'string' && (u === ayar.publicUrl || u.startsWith(ayar.publicUrl + '/'))) {
    const req = input instanceof Request && !init ? input : new Request(u, init ? { ...init, duplex: 'half' } : undefined);
    return handle(req, '127.0.0.1');
  }
  return disFetch(input, init);
};

// ---------- zamanlanmış işler (Supabase cron yerine) ----------
async function slotAl(k, v) {
  const r = await db.owner.query(`insert into public.wf_ayar(k, v) values ($1, $2) on conflict (k) do update set v = excluded.v
    where public.wf_ayar.v <> excluded.v returning 1`, [k, v]);
  return r.rowCount > 0;
}
async function isCalistir(ad) {
  const fn = fonksiyon(ad);
  const r = await fn(new Request(`${ayar.publicUrl}/functions/v1/${ad}`, { method: 'POST', headers: { 'x-wf-job-token': yerel.jobToken, 'Content-Type': 'application/json' }, body: '{}' }));
  console.log('is', ad, r.status);
}
async function zamanla(bildirim) {
  const now = new Date(), iso = now.toISOString();
  const bekleyen = (await db.owner.query('select exists(select 1 from public.stok_haber where notified_at is null) b')).rows[0].b;
  if (bekleyen && (bildirim ? await slotAl('is:stok-haber:bildirim', iso.slice(0, 16)) : now.getUTCMinutes() >= 7 && await slotAl('is:stok-haber', iso.slice(0, 13)))) {
    await isCalistir('stok-haber').catch((e) => console.error('stok-haber', e.message));
  }
  if (now.getUTCHours() * 60 + now.getUTCMinutes() >= 6 * 60 + 5 && await slotAl('is:dogum-gunu', iso.slice(0, 10))) {
    await isCalistir('dogum-gunu').catch((e) => console.error('dogum-gunu', e.message));
  }
}
let dinleyici = null;
function dinle() {
  setInterval(() => zamanla().catch((e) => console.error('zamanla', e.message)), 60e3).unref();
  const bagla = async () => {
    try {
      dinleyici = await db.owner.connect();
      let t = null;
      dinleyici.on('notification', (n) => { if (n.payload === 'stok-haber') { clearTimeout(t); t = setTimeout(() => zamanla(true).catch(() => {}), 20e3); } });
      dinleyici.on('error', () => { try { dinleyici.release(true); } catch { /* */ } setTimeout(bagla, 30e3); });
      await dinleyici.query('LISTEN wf_is');
    } catch { setTimeout(bagla, 30e3); }
  };
  bagla();
}

// ---------- HTTP ----------
const server = http.createServer(async (req, res) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  try {
    // vekil sunucular bu başlıkları "https, https" gibi çoğaltabiliyor: ilk değeri al
    const ilk = (v) => String(v || '').split(',')[0].trim();
    const proto = /^https?$/.test(ilk(req.headers['x-forwarded-proto'])) ? ilk(req.headers['x-forwarded-proto']) : 'https';
    const host = ilk(req.headers['x-forwarded-host']) || ilk(req.headers.host) || 'localhost';
    const chunks = [];
    let size = 0;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      for await (const c of req) { size += c.length; if (size > 60 * 1024 * 1024) { res.writeHead(413, CORS); return res.end(); } chunks.push(c); }
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const request = new Request(`${proto}://${host}${req.url}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, duplex: 'half' });
    const r = await handle(request, ip);
    const out = {};
    r.headers.forEach((v, k) => { out[k] = v; });
    for (const [k, v] of Object.entries(CORS)) if (!(k.toLowerCase() in out)) out[k] = v;
    res.writeHead(r.status, out);
    if (!r.body || req.method === 'HEAD') return res.end();
    Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res);
  } catch (e) {
    console.error('http', e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify({ message: 'Sunucu hatası', hata: String((e && e.message) || e).slice(0, 300), yer: 'http' }));
  }
});
server.requestTimeout = 180e3;
server.headersTimeout = 60e3;
if (process.env.WF_TEST !== '1') {
  server.listen(ayar.port, () => console.log('Wolflano sunucusu dinliyor:', ayar.port));
}

module.exports = { handle, server, hazir, durum };
