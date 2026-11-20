// /rest/v1: PostgREST'in sitenin kullandığı kısmı (select, filtreler, sıralama, ekleme/upsert, güncelleme, silme, rpc).
const { tx } = require('./db');
const { sema } = require('./sema');

class HttpErr extends Error {
  constructor(status, body) { super(body.message); this.status = status; this.body = body; }
}
const bad = (message, code = 'PGRST100') => new HttpErr(400, { code, message, details: null, hint: null });

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' };
const qi = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const KEY = /^[A-Za-z0-9_\- ]{1,64}$/;

// Supabase'de anon/authenticated için tablo izinleri (veritabanı da ayrıca uyguluyor)
const ANON_NONE = new Set(['wf_agenda', 'wf_support_case']);
const RPC = {
  anon: new Set(['is_toptan', 'is_wf_admin', 'is_wf_owner', 'wf_ara', 'wf_hit', 'wf_mankenler', 'wf_review_add', 'wf_reviews', 'wf_toptan_gizli']),
  authenticated: new Set(['is_toptan', 'is_wf_admin', 'is_wf_owner', 'wf_ara', 'wf_hit', 'wf_mankenler', 'wf_review_add', 'wf_reviews', 'wf_toptan_gizli', 'wf_request_design_support']),
};

function table(name) {
  const t = sema.tables.get(name);
  if (!t) throw new HttpErr(404, { code: '42P01', message: `relation "public.${name}" does not exist`, details: null, hint: null });
  return t;
}

// "data->>code", "data->a->>b", "col" -> { sql, name, text }
function field(t, s, alias) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)((?:->>?[A-Za-z0-9_\-]+)*)$/.exec(s);
  if (!m) throw bad(`"${s}" anlaşılamadı`);
  const col = m[1];
  if (!t.cols.has(col)) throw bad(`column ${t.name}.${col} does not exist`, '42703');
  let sql = (alias ? alias + '.' : '') + qi(col), name = col, text = false;
  const re = /(->>?)([A-Za-z0-9_\-]+)/g;
  let p;
  while ((p = re.exec(m[2]))) {
    sql = `(${sql}${p[1]}'${p[2]}')`;
    name = p[2];
    text = p[1] === '->>';
  }
  return { sql, name, col, text, type: m[2] ? (text ? 'text' : 'jsonb') : t.cols.get(col) };
}

function splitTop(s) {
  const out = [];
  let depth = 0, quote = false, cur = '';
  for (const ch of s) {
    if (ch === '"') quote = !quote;
    if (!quote && ch === '(') depth++;
    if (!quote && ch === ')') depth--;
    if (!quote && depth === 0 && ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur !== '') out.push(cur);
  return out;
}

function selectList(t, sel, alias) {
  if (!sel || sel === '*') return alias + '.*';
  return splitTop(sel).map((raw) => {
    let s = raw.trim();
    if (s === '*') return alias + '.*';
    if (s.includes('(')) throw bad('İlişkili tablo seçimi desteklenmiyor.');
    let as = null;
    const ci = s.indexOf(':');
    if (ci > 0 && s[ci + 1] !== ':') { as = s.slice(0, ci); s = s.slice(ci + 1); }
    let cast = null;
    const k = s.indexOf('::');
    if (k > 0) { cast = s.slice(k + 2); s = s.slice(0, k); if (!/^[a-z0-9_]+$/.test(cast)) throw bad('Geçersiz dönüşüm'); }
    const f = field(t, s, alias);
    const name = as || f.name;
    if (!KEY.test(name)) throw bad('Geçersiz ad');
    return `${cast ? `(${f.sql})::${cast}` : f.sql} AS ${qi(name)}`;
  }).join(', ');
}

function parseList(v) {
  const m = /^\((.*)\)$/s.exec(v);
  if (!m) throw bad('in.(...) bekleniyor');
  if (m[1] === '') return [];
  const out = [];
  let cur = '', quote = false, wasQuoted = false;
  for (let i = 0; i < m[1].length; i++) {
    const ch = m[1][i];
    if (ch === '"') { quote = !quote; wasQuoted = true; continue; }
    if (ch === '\\' && quote) { cur += m[1][++i]; continue; }
    if (ch === ',' && !quote) { out.push(wasQuoted ? cur : cur.trim()); cur = ''; wasQuoted = false; continue; }
    cur += ch;
  }
  out.push(wasQuoted ? cur : cur.trim());
  return out;
}

// tek filtre: alan, "op.değer" -> sql
function cond(t, fieldStr, expr, P, alias) {
  const f = field(t, fieldStr, alias);
  let neg = false, e = expr;
  if (e.startsWith('not.')) { neg = true; e = e.slice(4); }
  const dot = e.indexOf('.');
  if (dot < 0) throw bad(`"${expr}" filtresi anlaşılamadı`);
  const op = e.slice(0, dot), val = e.slice(dot + 1);
  const ph = (v) => { P.push(v); return '$' + P.length; };
  const tcast = (f.text ? 'text' : f.type);
  let sql;
  if (OPS[op]) sql = `${f.sql} ${OPS[op]} ${ph(val)}::${tcast}`;
  else if (op === 'like' || op === 'ilike') sql = `${f.sql}::text ${op === 'like' ? 'LIKE' : 'ILIKE'} ${ph(val.replace(/\*/g, '%'))}`;
  else if (op === 'is') {
    const v = val.toLowerCase();
    if (!['null', 'true', 'false', 'unknown'].includes(v)) throw bad('is.null/true/false bekleniyor');
    sql = `${f.sql} IS ${v.toUpperCase()}`;
  } else if (op === 'in') sql = `${f.sql} = ANY(${ph(parseList(val))}::${tcast}[])`;
  else if (op === 'cs') sql = `${f.sql} @> ${ph(val)}::${tcast}`;
  else if (op === 'cd') sql = `${f.sql} <@ ${ph(val)}::${tcast}`;
  else throw bad(`"${op}" filtresi desteklenmiyor`);
  return neg ? `NOT (${sql})` : sql;
}

// or=(a.eq.1,b.is.null,and(c.gt.1,d.lt.5))
function logic(t, kind, body, P, alias) {
  const m = /^\((.*)\)$/s.exec(body);
  if (!m) throw bad(`${kind}=(...) bekleniyor`);
  const parts = splitTop(m[1]).map((p) => {
    const s = p.trim();
    const lm = /^(not\.)?(and|or)(\(.*\))$/s.exec(s);
    if (lm) { const r = logic(t, lm[2], lm[3], P, alias); return lm[1] ? `NOT ${r}` : r; }
    const d = s.indexOf('.');
    if (d < 0) throw bad(`"${s}" anlaşılamadı`);
    return cond(t, s.slice(0, d), s.slice(d + 1), P, alias);
  });
  return '(' + parts.join(kind === 'or' ? ' OR ' : ' AND ') + ')';
}

function where(t, params, P, alias) {
  const w = [];
  for (const [k, v] of params) {
    if (RESERVED.has(k)) continue;
    const lm = /^(not\.)?(and|or)$/.exec(k);
    if (lm) { const r = logic(t, lm[2], v, P, alias); w.push(lm[1] ? `NOT ${r}` : r); continue; }
    w.push(cond(t, k, v, P, alias));
  }
  return w.length ? ' WHERE ' + w.join(' AND ') : '';
}

function orderBy(t, s, alias) {
  if (!s) return '';
  return ' ORDER BY ' + splitTop(s).map((p) => {
    const bits = p.trim().split('.');
    let i = bits.length;
    const mods = [];
    while (i > 1 && ['asc', 'desc', 'nullsfirst', 'nullslast'].includes(bits[i - 1])) mods.unshift(bits[--i]);
    const f = field(t, bits.slice(0, i).join('.'), alias);
    let o = f.sql + (mods.includes('desc') ? ' DESC' : ' ASC');
    if (mods.includes('nullsfirst')) o += ' NULLS FIRST';
    if (mods.includes('nullslast')) o += ' NULLS LAST';
    return o;
  }).join(', ');
}

const intParam = (v, max) => {
  if (v == null || v === '') return null;
  if (!/^\d+$/.test(v)) throw bad('limit/offset sayı olmalı');
  return Math.min(+v, max);
};

function prefer(h) {
  const o = {};
  String(h || '').split(',').forEach((x) => { const [k, v] = x.trim().split('='); if (k) o[k] = v || true; });
  return o;
}

function pgErr(e, claims) {
  if (e instanceof HttpErr) return e;
  if (e.code === 'WF001') return new HttpErr(503, { code: 'WF001', message: e.message, details: null, hint: null });
  const body = { code: e.code || 'XX000', message: e.message, details: e.detail || null, hint: e.hint || null };
  let st = 500;
  if (e.code === '42501') st = claims.role === 'anon' ? 401 : 403;
  else if (/^23/.test(e.code)) st = e.code === '23505' || e.code === '23503' ? 409 : 400;
  else if (/^22|^42703|^42883|^P0001|^42P10/.test(e.code || '')) st = 400;
  return new HttpErr(st, body);
}

// claims: oturum, req: { method, params: URLSearchParams, headers: Headers, body }
async function rest(claims, rel, req) {
  try {
    if (rel.startsWith('rpc/')) return await rpc(claims, rel.slice(4), req);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(rel)) throw bad('Geçersiz tablo adı');
    const t = table(rel);
    if (claims.role === 'anon' && ANON_NONE.has(rel)) {
      throw new HttpErr(401, { code: '42501', message: `permission denied for table ${rel}`, details: null, hint: null });
    }
    const p = req.params, pref = prefer(req.headers.get('prefer'));
    const single = /vnd\.pgrst\.object/.test(req.headers.get('accept') || '');
    const P = [];
    const sel = selectList(t, p.get('select'), '_t');
    const m = req.method;
    let sql, countSql = null;
    if (m === 'GET' || m === 'HEAD') {
      const w = where(t, p, P, '_t');
      const lim = intParam(p.get('limit'), 100000), off = intParam(p.get('offset'), 10000000);
      sql = `SELECT ${sel} FROM public.${qi(t.name)} _t${w}${orderBy(t, p.get('order'), '_t')}` +
        (lim != null ? ` LIMIT ${lim}` : '') + (off != null ? ` OFFSET ${off}` : '');
      if (pref.count) countSql = `SELECT count(*)::int n FROM public.${qi(t.name)} _t${w}`;
    } else if (m === 'POST') {
      let rows = req.body;
      if (rows && !Array.isArray(rows)) rows = [rows];
      if (!Array.isArray(rows) || !rows.length || rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r))) throw bad('Gövde nesne ya da nesne dizisi olmalı', 'PGRST102');
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      cols.forEach((c) => { if (!t.cols.has(c)) throw bad(`Could not find the '${c}' column of '${t.name}'`, 'PGRST204'); });
      P.push(JSON.stringify(rows));
      const cl = cols.map(qi).join(', ');
      sql = `INSERT INTO public.${qi(t.name)} AS _t (${cl}) SELECT ${cl} FROM json_populate_recordset(null::public.${qi(t.name)}, $1::json)`;
      const res = pref.resolution;
      const oc = p.get('on_conflict');
      if (res || oc) {
        const target = oc ? oc.split(',').map((s) => s.trim()) : t.pk;
        target.forEach((c) => { if (!t.cols.has(c)) throw bad(`on_conflict sütunu yok: ${c}`); });
        if (!target.length) throw bad('Çakışma sütunu bulunamadı');
        if (res === 'ignore-duplicates') sql += ` ON CONFLICT (${target.map(qi).join(', ')}) DO NOTHING`;
        else {
          const upd = cols.filter((c) => !target.includes(c));
          sql += ` ON CONFLICT (${target.map(qi).join(', ')}) DO ` +
            (upd.length ? 'UPDATE SET ' + upd.map((c) => `${qi(c)} = EXCLUDED.${qi(c)}`).join(', ') : 'NOTHING');
        }
      }
    } else if (m === 'PATCH') {
      const b = req.body;
      if (!b || typeof b !== 'object' || Array.isArray(b)) throw bad('Gövde nesne olmalı', 'PGRST102');
      const cols = Object.keys(b);
      if (!cols.length) throw bad('Güncellenecek alan yok');
      cols.forEach((c) => { if (!t.cols.has(c)) throw bad(`Could not find the '${c}' column of '${t.name}'`, 'PGRST204'); });
      P.push(JSON.stringify(b));
      sql = `UPDATE public.${qi(t.name)} AS _t SET ${cols.map((c) => `${qi(c)} = _r.${qi(c)}`).join(', ')}` +
        ` FROM json_populate_record(null::public.${qi(t.name)}, $1::json) _r` + where(t, p, P, '_t');
    } else if (m === 'DELETE') {
      sql = `DELETE FROM public.${qi(t.name)} AS _t` + where(t, p, P, '_t');
    } else {
      throw new HttpErr(405, { code: 'PGRST117', message: 'Unsupported HTTP method', details: null, hint: null });
    }
    const write = m !== 'GET' && m !== 'HEAD';
    const wantRows = !write || pref.return === 'representation' || single;
    const out = await tx(claims, async (c) => {
      let r;
      if (!write) r = await c.query(`SELECT coalesce(json_agg(_x), '[]'::json)::text j, count(*)::int n FROM (${sql}) _x`, P);
      else if (wantRows) r = await c.query(`WITH _w AS (${sql} RETURNING _t.*) SELECT coalesce(json_agg(_x), '[]'::json)::text j, count(*)::int n FROM (SELECT ${sel} FROM _w _t) _x`, P);
      else r = await c.query(`WITH _w AS (${sql} RETURNING 1) SELECT null j, count(*)::int n FROM _w`, P);
      let total = null;
      if (countSql) total = (await c.query(countSql, P)).rows[0].n;
      const n = r.rows[0].n;
      if (single && n !== 1) {
        // tekil istekte satır sayısı 1 değilse PostgREST yazmayı da geri alır
        throw new HttpErr(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${n} rows`, hint: null });
      }
      return { j: r.rows[0].j, n, total };
    });
    const headers = { 'Content-Type': 'application/json; charset=utf-8' };
    if (countSql || pref.count) headers['Content-Range'] = (out.n ? `0-${out.n - 1}` : '*') + '/' + (out.total != null ? out.total : '*');
    if (!wantRows) return { status: m === 'POST' ? 201 : 204, headers, body: null };
    let body = out.j;
    if (single) body = JSON.stringify(JSON.parse(out.j)[0]);
    return { status: m === 'POST' ? 201 : 200, headers, body: m === 'HEAD' ? null : body };
  } catch (e) {
    const he = pgErr(e, claims);
    return { status: he.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(he.body) };
  }
}

async function rpc(claims, name, req) {
  const f = sema.fns.get(name);
  const allowed = claims.role === 'service_role' || (RPC[claims.role] && RPC[claims.role].has(name));
  if (!f || !allowed) throw new HttpErr(404, { code: 'PGRST202', message: `Could not find the function public.${name}`, details: null, hint: null });
  let args = {};
  if (req.method === 'POST') {
    args = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  } else if (req.method === 'GET' || req.method === 'HEAD') {
    for (const [k, v] of req.params) { if (!RESERVED.has(k)) args[k] = v; }
  } else {
    throw new HttpErr(405, { code: 'PGRST117', message: 'Unsupported HTTP method', details: null, hint: null });
  }
  const P = [JSON.stringify(args)];
  const call = [];
  for (const a of f.args) {
    if (!a.name || !Object.hasOwn(args, a.name)) continue;
    const k = `'${a.name.replace(/'/g, "''")}'`;
    let e;
    if (/\[\]$/.test(a.type)) e = `ARRAY(SELECT json_array_elements_text($1::json->${k}))::${a.type}`;
    else if (/^jsonb?$/.test(a.type)) e = `($1::json->${k})::${a.type}`;
    else e = `($1::json->>${k})::${a.type}`;
    call.push(`${qi(a.name)} => ${e}`);
  }
  Object.keys(args).forEach((k) => { if (!f.args.some((a) => a.name === k)) throw bad(`Fonksiyonda "${k}" argümanı yok`, 'PGRST202'); });
  const fx = `public.${qi(f.name)}(${call.join(', ')})`;
  if (!call.length) P.length = 0;
  const out = await tx(claims, async (c) => {
    if (f.rt === 'void' && !f.set) { await c.query(`SELECT ${fx}`, P); return null; }
    const sql = f.set
      ? `SELECT coalesce(json_agg(_r), '[]'::json)::text j FROM ${fx} _r`
      : `SELECT to_json(${fx})::text j`;
    return (await c.query(sql, P)).rows[0].j;
  });
  if (out === null) return { status: 204, headers: {}, body: null };
  return { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: out };
}

module.exports = { rest: async (claims, rel, req) => {
  try { return await rest(claims, rel, req); } catch (e) {
    const he = pgErr(e, claims);
    return { status: he.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(he.body) };
  }
}, HttpErr };
