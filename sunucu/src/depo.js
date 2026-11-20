// /storage/v1: dosya deposu. Dosyalar diskte <DEPO_DIR>/<kova>/<yol> olarak durur, bilgileri public.storage_objects tablosunda.
// Kovalar ve kuralları Supabase'dekinin aynısı: site (herkese açık), designs, belgeler, kasa (özel).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { owner, tx } = require('./db');
const jwt = require('./jwt');
const ayar = require('./ayar');

const BUCKETS = ['site', 'designs', 'belgeler', 'kasa'];
const MAX = 50 * 1024 * 1024;
const MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', json: 'application/json', pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8', html: 'text/plain; charset=utf-8', css: 'text/css', js: 'text/plain; charset=utf-8', woff2: 'font/woff2', ttf: 'font/ttf', zip: 'application/zip',
};
const mimeOf = (n) => MIME[(n.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

const json = (status, o, h = {}) => ({ status, headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(o) });
const fail = (status, error, message) => json(status, { statusCode: String(status), error, message });

function cleanName(n) {
  if (typeof n !== 'string') return null;
  let s;
  try { s = decodeURIComponent(n); } catch { return null; }
  s = s.replace(/^\/+/, '');
  if (!s || s.length > 1024 || /[\\\0]/.test(s)) return null;
  const parts = s.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..')) return null;
  return parts.join('/');
}
const diskPath = (b, n) => path.join(ayar.depo, b, ...n.split('/'));

// Yetki: Supabase storage policy'lerinin karşılığı
async function rights(claims) {
  if (claims.role === 'service_role') return { svc: true };
  if (claims.role !== 'authenticated') return { anon: true };
  if (claims._r) return claims._r;
  const r = await tx(claims, (c) => c.query('select public.is_wf_admin() a, public.is_wf_owner() o'));
  claims._r = { uid: claims.sub, admin: !!r.rows[0].a, owner: !!r.rows[0].o };
  return claims._r;
}
async function can(claims, bucket, op, name) {
  const r = await rights(claims);
  if (r.svc) return true;
  // site: herkes /object/public üzerinden okur; listeleme, yükleme, silme yalnız yönetici
  if (bucket === 'site') return !!r.admin;
  if (r.anon) return false;
  const first = String(name || '').split('/')[0];
  if (bucket === 'designs') return op === 'read' ? (first === r.uid || r.admin) : op === 'insert' ? first === r.uid : false;
  if (bucket === 'belgeler') return op === 'read' && r.admin;
  if (bucket === 'kasa') return r.owner;
  return false;
}

async function exists(b, n) {
  try { return (await fsp.stat(diskPath(b, n))).isFile(); } catch { return false; }
}

async function save(b, n, buf, type, uid) {
  const p = diskPath(b, n);
  await fsp.mkdir(path.dirname(p), { recursive: true });
  const tmp = p + '.yukleniyor-' + crypto.randomBytes(4).toString('hex');
  await fsp.writeFile(tmp, buf);
  await fsp.rename(tmp, p);
  await owner.query(`insert into public.storage_objects(bucket_id, name, size, mimetype, owner) values ($1, $2, $3, $4, $5)
    on conflict (bucket_id, name) do update set size = excluded.size, mimetype = excluded.mimetype, updated_at = now()`,
  [b, n, buf.length, type, uid || null]);
}

async function readBody(req) {
  const ct = req.headers.get('content-type') || '';
  if (/^multipart\/form-data/i.test(ct)) {
    const fd = await req.raw.formData();
    for (const [, v] of fd) if (typeof v === 'object' && v && typeof v.arrayBuffer === 'function') {
      return { buf: Buffer.from(await v.arrayBuffer()), type: v.type || null };
    }
    return null;
  }
  return { buf: Buffer.from(await req.raw.arrayBuffer()), type: ct.split(';')[0] || null };
}

// dosya gönder (Range desteğiyle: videolar için)
async function serve(b, n, req, cache) {
  const p = diskPath(b, n);
  let st;
  try { st = await fsp.stat(p); } catch { st = null; }
  if (!st || !st.isFile()) return fail(400, 'not_found', 'Object not found');
  const etag = '"' + st.size.toString(16) + '-' + Math.floor(st.mtimeMs).toString(16) + '"';
  const h = {
    'Content-Type': mimeOf(n), 'Cache-Control': cache, ETag: etag, 'Last-Modified': st.mtime.toUTCString(),
    'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff',
  };
  if (req.headers.get('if-none-match') === etag) return { status: 304, headers: h, body: null };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? +range[1] : st.size - +range[2], end = range[1] && range[2] ? +range[2] : st.size - 1;
    if (start < 0) start = 0;
    if (end >= st.size) end = st.size - 1;
    if (start > end) return { status: 416, headers: { 'Content-Range': `bytes */${st.size}` }, body: null };
    return { status: 206, headers: { ...h, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': String(end - start + 1) },
      stream: () => fs.createReadStream(p, { start, end }) };
  }
  h['Content-Length'] = String(st.size);
  return { status: 200, headers: h, stream: req.method === 'HEAD' ? null : () => fs.createReadStream(p) };
}

async function depo(rel, req) {
  const { method, claims } = req;
  let m;

  // herkese açık okuma
  if ((m = /^object\/public\/([a-z]+)\/(.+)$/.exec(rel)) && (method === 'GET' || method === 'HEAD')) {
    const n = cleanName(m[2]);
    if (!ayar.publicBuckets.includes(m[1]) || !n) return fail(400, 'not_found', 'Bucket not found');
    return serve(m[1], n, req, 'public, max-age=3600');
  }
  // imzalı bağlantıyla okuma
  if ((m = /^object\/sign\/([a-z]+)\/(.+)$/.exec(rel)) && (method === 'GET' || method === 'HEAD')) {
    const n = cleanName(m[2]);
    const p = jwt.verify(req.params.get('token') || '');
    if (!n || !p || p.expired || p.url !== m[1] + '/' + n) return fail(400, 'InvalidJWT', 'Invalid signature');
    return serve(m[1], n, req, 'private, max-age=600');
  }
  // imzalı bağlantı oluştur
  if ((m = /^object\/sign\/([a-z]+)(?:\/(.+))?$/.exec(rel)) && method === 'POST') {
    const b = m[1], body = req.body || {};
    const exp = Math.max(60, Math.min(7 * 86400, +body.expiresIn || 3600));
    const one = async (n) => {
      if (!n || !BUCKETS.includes(b) || !(await can(claims, b, 'read', n)) || !(await exists(b, n))) return null;
      const tok = jwt.sign({ url: b + '/' + n, exp: Math.floor(Date.now() / 1000) + exp });
      return `/object/sign/${b}/${n.split('/').map(encodeURIComponent).join('/')}?token=${tok}`;
    };
    if (m[2]) {
      const u = await one(cleanName(m[2]));
      return u ? json(200, { signedURL: u }) : fail(400, 'not_found', 'Object not found');
    }
    const paths = Array.isArray(body.paths) ? body.paths.slice(0, 1000) : [];
    const out = [];
    for (const p of paths) {
      const n = cleanName(String(p)), u = await one(n);
      out.push({ error: u ? null : 'Either the object does not exist or you do not have access to it', path: p, signedURL: u, signedUrl: u });
    }
    return json(200, out);
  }
  // listeleme
  if ((m = /^object\/list\/([a-z]+)$/.exec(rel)) && method === 'POST') {
    const b = m[1], body = req.body || {};
    if (!BUCKETS.includes(b)) return fail(400, 'not_found', 'Bucket not found');
    let prefix = String(body.prefix || '').replace(/^\/+/, '');
    if (prefix && !prefix.endsWith('/')) prefix += '/';
    const limit = Math.max(1, Math.min(1000, +body.limit || 100)), offset = Math.max(0, +body.offset || 0);
    const r = await owner.query("select name, size, mimetype, created_at, updated_at from public.storage_objects where bucket_id = $1 and name like $2 escape '\\' order by name",
      [b, prefix.replace(/[\\%_]/g, (x) => '\\' + x) + '%']);
    const seen = new Map();
    for (const row of r.rows) {
      if (!(await can(claims, b, 'read', row.name))) continue;
      const rest = row.name.slice(prefix.length);
      const k = rest.indexOf('/');
      if (k >= 0) { const d = rest.slice(0, k); if (!seen.has(d)) seen.set(d, { name: d, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null }); continue; }
      seen.set(rest, {
        name: rest, id: crypto.createHash('md5').update(b + '/' + row.name).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'),
        updated_at: row.updated_at, created_at: row.created_at, last_accessed_at: row.updated_at,
        metadata: { size: +row.size, mimetype: row.mimetype || mimeOf(rest), cacheControl: 'max-age=3600', lastModified: row.updated_at, contentLength: +row.size },
      });
    }
    let items = [...seen.values()];
    if (body.search) items = items.filter((x) => x.name.toLowerCase().includes(String(body.search).toLowerCase()));
    const col = (body.sortBy && body.sortBy.column) || 'name', desc = body.sortBy && body.sortBy.order === 'desc';
    items.sort((a, c) => { const x = a[col] || '', y = c[col] || ''; return (x > y ? 1 : x < y ? -1 : 0) * (desc ? -1 : 1); });
    return json(200, items.slice(offset, offset + limit));
  }
  // silme: { prefixes: [...] }
  if ((m = /^object\/([a-z]+)$/.exec(rel)) && method === 'DELETE') {
    const b = m[1], list = Array.isArray((req.body || {}).prefixes) ? req.body.prefixes.slice(0, 1000) : [];
    if (!BUCKETS.includes(b)) return fail(400, 'not_found', 'Bucket not found');
    const out = [];
    for (const p of list) {
      const n = cleanName(String(p));
      if (!n || !(await can(claims, b, 'delete', n))) continue;
      try { await fsp.unlink(diskPath(b, n)); } catch { /* yoksa da kaydı silinir */ }
      const d = await owner.query('delete from public.storage_objects where bucket_id = $1 and name = $2 returning name', [b, n]);
      if (d.rowCount) out.push({ bucket_id: b, name: n });
    }
    return json(200, out);
  }
  // yükleme / okuma: object/<kova>/<yol>, object/authenticated/<kova>/<yol>
  if ((m = /^object\/(?:authenticated\/)?([a-z]+)\/(.+)$/.exec(rel))) {
    const b = m[1], n = cleanName(m[2]);
    if (!BUCKETS.includes(b) || !n) return fail(400, 'not_found', 'Bucket not found');
    if (method === 'GET' || method === 'HEAD') {
      if (!(await can(claims, b, 'read', n))) return fail(400, 'not_found', 'Object not found');
      return serve(b, n, req, 'private, max-age=600');
    }
    if (method === 'POST' || method === 'PUT') {
      const upsert = method === 'PUT' || /^true$/i.test(req.headers.get('x-upsert') || '');
      const had = await exists(b, n);
      if (had && !upsert) return fail(400, 'Duplicate', 'The resource already exists');
      if (!(await can(claims, b, had ? 'update' : 'insert', n))) return json(403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      const len = +(req.headers.get('content-length') || 0);
      if (len > MAX) return fail(413, 'Payload too large', 'The object exceeded the maximum allowed size');
      const f = await readBody(req);
      if (!f || !f.buf.length) return fail(400, 'invalid', 'Dosya boş');
      if (f.buf.length > MAX) return fail(413, 'Payload too large', 'The object exceeded the maximum allowed size');
      const type = (f.type && f.type !== 'application/octet-stream' && !/multipart/.test(f.type)) ? f.type : mimeOf(n);
      await save(b, n, f.buf, type, claims.sub);
      return json(200, { Key: b + '/' + n, Id: crypto.randomUUID() });
    }
  }
  return fail(404, 'not_found', 'Bu adres yok.');
}

// Açılışta: depo tablosu boşsa diskteki dosyaları tabloya yaz (önceki gece kopyalanan 3025 dosya için)
async function tara() {
  const sayi = {};
  for (const b of BUCKETS) {
    const base = path.join(ayar.depo, b);
    const c = await owner.query('select count(*)::int n from public.storage_objects where bucket_id = $1', [b]);
    if (c.rows[0].n > 0) { sayi[b] = c.rows[0].n; continue; }
    const rows = [];
    const walk = async (dir, pre) => {
      let ents;
      try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        if (e.name.startsWith('.') || /\.yukleniyor-/.test(e.name)) continue;
        const full = path.join(dir, e.name), n = pre ? pre + '/' + e.name : e.name;
        if (e.isDirectory()) await walk(full, n);
        else if (e.isFile()) { const st = await fsp.stat(full); rows.push([n, st.size, st.mtime]); }
      }
    };
    await walk(base, '');
    for (let i = 0; i < rows.length; i += 500) {
      const part = rows.slice(i, i + 500);
      await owner.query(`insert into public.storage_objects(bucket_id, name, size, mimetype, created_at, updated_at)
        select $1, x.n, x.s, x.m, x.t, x.t from json_to_recordset($2::json) as x(n text, s bigint, m text, t timestamptz) on conflict do nothing`,
      [b, JSON.stringify(part.map(([n, s, t]) => ({ n, s, m: mimeOf(n), t })))]);
    }
    sayi[b] = rows.length;
  }
  return sayi;
}

module.exports = { depo, tara };
