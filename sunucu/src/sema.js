// Tablo ve fonksiyon bilgisi (PostgREST'in şema önbelleği gibi). Sorgularda yalnız gerçekten var olan adlara izin verilir.
const { owner } = require('./db');
const { INTERNAL } = require('./kurulum');

const sema = { tables: new Map(), fns: new Map(), at: 0 };

async function yukle() {
  const t = await owner.query(`
    select c.relname t, a.attname col, format_type(a.atttypid, a.atttypmod) ty, a.attnum n,
      (select array_agg(att.attname::text order by k.ord) from pg_index i
         cross join unnest(i.indkey) with ordinality k(attnum, ord)
         join pg_attribute att on att.attrelid = i.indrelid and att.attnum = k.attnum
        where i.indrelid = c.oid and i.indisprimary) pk
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where s.nspname = 'public' and c.relkind in ('r', 'v') order by c.relname, a.attnum`);
  const tables = new Map();
  for (const r of t.rows) {
    if (INTERNAL.includes(r.t)) continue;
    if (!tables.has(r.t)) tables.set(r.t, { name: r.t, cols: new Map(), pk: r.pk || [] });
    tables.get(r.t).cols.set(r.col, r.ty);
  }
  const f = await owner.query(`
    select p.proname n, p.proretset set, format_type(p.prorettype, null) rt, p.prorettype = 'trigger'::regtype trg,
      coalesce(p.proargnames::text[], '{}') names, coalesce(p.proargmodes::text[], '{}') modes,
      array(select format_type(x, null) from unnest(p.proargtypes) x) types
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.prokind = 'f'`);
  const fns = new Map();
  for (const r of f.rows) {
    if (r.trg || /^auth_/.test(r.n)) continue;
    // yalnız giriş argümanları (OUT/TABLE sütunları hariç)
    const ins = [];
    let ti = 0;
    r.names.forEach((nm, i) => {
      const m = r.modes[i] || 'i';
      if (m === 'i' || m === 'b' || m === 'v') ins.push({ name: nm, type: r.types[ti++] });
    });
    if (!r.names.length) r.types.forEach((ty) => ins.push({ name: null, type: ty }));
    fns.set(r.n, { name: r.n, set: r.set, rt: r.rt, args: ins });
  }
  sema.tables = tables;
  sema.fns = fns;
  sema.at = Date.now();
  return sema;
}

module.exports = { sema, yukle };
