// Veritabanı kurulumu: her açılışta çalışır, tekrar çalışması zararsızdır.
// Supabase'e özel parçaların (auth, storage, erişim kuralları) yerine geçenleri kurar.
const { owner } = require('./db');
const ayar = require('./ayar');

const A = "public.auth_role() = 'authenticated' AND ";
const uid = 'public.auth_uid()';
const em = "lower(coalesce(public.auth_jwt() ->> 'email', ''))";
const adm = 'public.is_wf_admin()';
const own = 'public.is_wf_owner()';

// Supabase'deki erişim kuralları (pg_policies, 2026-11-20). "TO authenticated" olanlar A ile başlar.
// [tablo, ad, komut, using, with check]
const POLICIES = [
  ['admin_designs', 'admin all', 'ALL', A + adm, A + adm],
  ['admin_designs', 'public templates', 'SELECT', "(kind = ANY (ARRAY['sablon','zemin'])) AND published", null],
  ['admin_kv', 'admin all', 'ALL', A + adm, A + adm],
  ['bz_designs', 'admin update', 'UPDATE', A + adm, A + adm],
  ['bz_designs', 'own insert', 'INSERT', null, A + `user_id = ${uid}`],
  ['bz_designs', 'own or admin select', 'SELECT', A + `(user_id = ${uid} OR ${adm})`, null],
  ['carts', 'admin all', 'ALL', A + adm, A + adm],
  ['crm_customers', 'admin all', 'ALL', A + adm, A + adm],
  ['crm_notes', 'admin all', 'ALL', A + adm, A + adm],
  ['designs', 'own delete', 'DELETE', `user_id = ${uid}`, null],
  ['designs', 'own insert', 'INSERT', null, `user_id = ${uid}`],
  ['designs', 'public or own select', 'SELECT', `is_public = true OR user_id = ${uid}`, null],
  ['designs', 'own update', 'UPDATE', `user_id = ${uid}`, null],
  ['favorites', 'own delete', 'DELETE', `user_id = ${uid}`, null],
  ['favorites', 'own insert', 'INSERT', null, `user_id = ${uid}`],
  ['favorites', 'own select', 'SELECT', `user_id = ${uid}`, null],
  ['muhasebe', 'admin all', 'ALL', A + adm, A + adm],
  ['orders', 'admin insert', 'INSERT', null, A + adm],
  ['orders', 'admin update', 'UPDATE', A + adm, A + adm],
  ['orders', 'own or admin select', 'SELECT', A + `(user_id = ${uid} OR ${adm})`, null],
  ['orders', 'own insert', 'INSERT', null, `user_id = ${uid}`],
  ['orders', 'own select', 'SELECT', `user_id = ${uid}`, null],
  ['profiles', 'own insert', 'INSERT', null, A + `${uid} = id`],
  ['profiles', 'own select', 'SELECT', A + `${uid} = id`, null],
  ['profiles', 'own update', 'UPDATE', A + `${uid} = id`, A + `${uid} = id`],
  ['returns', 'admin all', 'ALL', A + adm, A + adm],
  ['reviews', 'admin all', 'ALL', A + adm, A + adm],
  ['site_content', 'admin delete', 'DELETE', adm, null],
  ['site_content', 'admin insert', 'INSERT', null, adm],
  ['site_content', 'admin update', 'UPDATE', adm, adm],
  ['site_content', 'public read', 'SELECT', 'true', null],
  ['site_search', 'admin read', 'SELECT', adm, null],
  ['site_stats', 'admin read', 'SELECT', A + adm, null],
  ['stok_haber', 'admin all', 'ALL', A + adm, A + adm],
  ['stok_haber', 'member insert', 'INSERT', null, A + `notified_at IS NULL AND user_email = ${em} AND contact = user_email`],
  ['stok_haber', 'own read', 'SELECT', A + `user_email = ${em}`, null],
  ['toptan_ayar', 'admin', 'ALL', A + adm, A + adm],
  ['toptan_ayar', 'read', 'SELECT', A + `(public.is_toptan() OR ${adm})`, null],
  ['toptan_basvuru', 'admin write', 'UPDATE', A + adm, A + adm],
  ['toptan_basvuru', 'own read', 'SELECT', A + `(user_id = ${uid} OR ${adm})`, null],
  ['user_designs', 'admin read', 'SELECT', adm, null],
  ['user_designs', 'own', 'ALL', `user_id = ${uid}`, `user_id = ${uid}`],
  ['user_profiles', 'own insert', 'INSERT', null, `${uid} = id`],
  ['user_profiles', 'public select', 'SELECT', 'true', null],
  ['user_profiles', 'own update', 'UPDATE', `${uid} = id`, null],
  ['wf_agenda', 'owner', 'ALL', A + own, A + own],
  ['wf_ithalat', 'admin all', 'ALL', A + adm, A + adm],
  ['wf_ithalat_log', 'admin read', 'SELECT', A + adm, null],
  ['wf_kasa', 'owner all', 'ALL', A + own, A + own],
  ['wf_staff', 'owner all', 'ALL', A + own, A + own],
  ['wf_staff', 'self read', 'SELECT', A + `email = ${em}`, null],
  ['wf_support_case', 'owner', 'SELECT', A + own, null],
];

// Sitenin (anon/authenticated) hiç dokunamayacağı iç tablolar
const INTERNAL = ['auth_users', 'auth_tokens', 'wf_ayar', 'storage_objects'];
// Supabase'de anon/authenticated için kapalı fonksiyonlar (yalnız sunucu fonksiyonları çağırır)
const NO_EXEC = ['bz_refund(uuid)', 'bz_take(uuid, integer)', 'crm_on_order()', 'handle_new_user()', 'stok_haber_kick()'];

const STEPS = [
  ['auth tabloları', `
    ALTER TABLE public.auth_users
      ADD COLUMN IF NOT EXISTS encrypted_password text,
      ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz,
      ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz,
      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
    UPDATE public.auth_users SET email_confirmed_at = created_at WHERE email_confirmed_at IS NULL AND encrypted_password IS NULL;
    UPDATE public.auth_users SET email = lower(email) WHERE email <> lower(email);
    CREATE UNIQUE INDEX IF NOT EXISTS auth_users_email_key ON public.auth_users (lower(email));
    CREATE TABLE IF NOT EXISTS public.auth_tokens (
      hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.auth_users(id) ON DELETE CASCADE,
      kind text NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), used_at timestamptz);
    CREATE INDEX IF NOT EXISTS auth_tokens_user_idx ON public.auth_tokens (user_id, kind);
    CREATE TABLE IF NOT EXISTS public.wf_ayar (k text PRIMARY KEY, v text NOT NULL);
    CREATE TABLE IF NOT EXISTS public.storage_objects (
      bucket_id text NOT NULL, name text NOT NULL, size bigint, mimetype text, owner uuid,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (bucket_id, name));`],
  ['auth fonksiyonları', `
    CREATE OR REPLACE FUNCTION public.auth_jwt() RETURNS jsonb LANGUAGE sql STABLE
      AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    CREATE OR REPLACE FUNCTION public.auth_uid() RETURNS uuid LANGUAGE sql STABLE
      AS $$ SELECT nullif(public.auth_jwt() ->> 'sub', '')::uuid $$;
    CREATE OR REPLACE FUNCTION public.auth_role() RETURNS text LANGUAGE sql STABLE
      AS $$ SELECT coalesce(public.auth_jwt() ->> 'role', 'anon') $$;`],
  ['yeni üye profili', `
    DROP TRIGGER IF EXISTS on_auth_user_created ON public.auth_users;
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON public.auth_users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`],
  ['stok haber tetikleyici', `
    CREATE OR REPLACE FUNCTION public.stok_haber_kick() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $f$
    begin
      if exists (select 1 from public.stok_haber where notified_at is null) then perform pg_notify('wf_is', 'stok-haber'); end if;
      return new;
    end $f$;`],
  ['manken listesi', `
    CREATE OR REPLACE FUNCTION public.wf_mankenler() RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
      AS $f$ select name from public.storage_objects where bucket_id = 'site' and name like 'img/manken-%' order by name $f$;`],
];

async function run(c, sql) { await c.query(sql); }

async function kurulum() {
  const rapor = [];
  const c = await owner.connect();
  const adim = async (ad, fn) => {
    try { await c.query('BEGIN'); await fn(); await c.query('COMMIT'); rapor.push([ad, 'tamam']); }
    catch (e) { try { await c.query('ROLLBACK'); } catch { /* */ } rapor.push([ad, 'HATA: ' + e.message]); }
  };
  try {
    for (const [ad, sql] of STEPS) await adim(ad, () => run(c, sql));

    await adim('erişim kuralları', async () => {
      const t = await c.query("select tablename from pg_tables where schemaname = 'public'");
      const tables = t.rows.map((r) => r.tablename);
      const p = await c.query("select tablename, policyname from pg_policies where schemaname = 'public'");
      for (const r of p.rows) await c.query(`DROP POLICY ${q(r.policyname)} ON public.${q(r.tablename)}`);
      for (const tb of tables) await c.query(`ALTER TABLE public.${q(tb)} ENABLE ROW LEVEL SECURITY`);
      for (const [tb, ad, cmd, using, check] of POLICIES) {
        if (!tables.includes(tb)) continue;
        await c.query(`CREATE POLICY ${q(ad)} ON public.${q(tb)} FOR ${cmd} TO PUBLIC` +
          (using ? ` USING (${using})` : '') + (check ? ` WITH CHECK (${check})` : ''));
      }
    });

    await adim('site kullanıcısı yetkileri', async () => {
      const r = await c.query('select 1 from pg_roles where rolname = $1', [ayar.apiDb.user]);
      if (!r.rowCount) throw new Error(`"${ayar.apiDb.user}" adlı veritabanı kullanıcısı yok (Plesk'te oluşturulmalı).`);
      if (ayar.apiDb.user === ayar.db.user) throw new Error('API_DB_USER tablo sahibiyle aynı olamaz.');
      const api = q(ayar.apiDb.user);
      await c.query(`GRANT USAGE ON SCHEMA public TO ${api}`);
      await c.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${api}`);
      await c.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${api}`);
      await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${api}`);
      await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${api}`);
      for (const tb of INTERNAL) {
        const ex = await c.query('select 1 from pg_tables where schemaname = $1 and tablename = $2', ['public', tb]);
        if (ex.rowCount) await c.query(`REVOKE ALL ON public.${q(tb)} FROM ${api}, PUBLIC`);
      }
      // Supabase'deki tablo izinleri: wf_agenda silinemez, wf_support_case yalnız okunur
      await c.query(`REVOKE DELETE ON public.wf_agenda FROM ${api}`).catch(() => {});
      await c.query(`REVOKE INSERT, UPDATE, DELETE ON public.wf_support_case FROM ${api}`).catch(() => {});
      for (const f of NO_EXEC) await c.query(`REVOKE EXECUTE ON FUNCTION public.${f} FROM PUBLIC, ${api}`).catch(() => {});
    });

    await adim('eski adresleri çevir', async () => {
      const done = await c.query("select v from public.wf_ayar where k = 'url'");
      if (done.rows[0] && done.rows[0].v === ayar.publicUrl) return;
      const cols = await c.query(`select table_name, column_name, data_type from information_schema.columns
        where table_schema = 'public' and data_type in ('text','jsonb','json','character varying')
          and table_name <> all($1) and table_name in (select tablename from pg_tables where schemaname = 'public')`, [INTERNAL]);
      let n = 0;
      for (const r of cols.rows) {
        const col = q(r.column_name), ty = r.data_type === 'character varying' ? 'varchar' : r.data_type;
        const u = await c.query(`UPDATE public.${q(r.table_name)} SET ${col} = replace(${col}::text, $1, $2)::${ty} WHERE ${col}::text LIKE $3`,
          [ayar.oldUrl, ayar.publicUrl, '%' + ayar.oldUrl + '%']);
        n += u.rowCount;
      }
      await c.query("insert into public.wf_ayar(k, v) values ('url', $1) on conflict (k) do update set v = excluded.v", [ayar.publicUrl]);
      rapor.push(['  çevrilen kayıt', String(n)]);
    });
  } finally {
    c.release();
  }
  return rapor;
}

const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';

module.exports = { kurulum, INTERNAL };
