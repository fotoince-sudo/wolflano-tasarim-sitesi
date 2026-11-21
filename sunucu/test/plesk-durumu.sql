-- Plesk'teki yüklemenin (yukle.sh v3) bıraktığı durumun test kopyası: Supabase şeması, auth.* -> public.auth_*, policy yok.
-- Testte gerçek e-postalar yerine örnek adresler kullanılır (sahip@ornek.com = site sahibi).
CREATE TABLE public.auth_users (id uuid PRIMARY KEY, email text, created_at timestamptz DEFAULT now(), raw_user_meta_data jsonb DEFAULT '{}'::jsonb, raw_app_meta_data jsonb DEFAULT '{}'::jsonb);
INSERT INTO public.auth_users (id,email,created_at) VALUES
 ('0a65f122-dcdb-4f5c-afab-12f1b767f96e','uye@ornek.com','2026-10-10T23:01:21+00'),
 ('554778a7-9d6a-49db-9c63-bd3f42a824e6','sahip@ornek.com','2026-10-12T20:36:53+00');
CREATE FUNCTION public.auth_uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.auth_jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION public.auth_role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'anon'::text $$;
CREATE SEQUENCE public.wf_ithalat_log_id_seq;
CREATE TABLE public.admin_designs (id uuid DEFAULT gen_random_uuid() NOT NULL, title text DEFAULT 'Adsız tasarım'::text NOT NULL, kind text DEFAULT 'taslak'::text NOT NULL, status text DEFAULT 'yeni'::text NOT NULL, product text, cut text, color text, qty integer DEFAULT 0 NOT NULL, sizes jsonb DEFAULT '{}'::jsonb NOT NULL, data jsonb DEFAULT '{}'::jsonb NOT NULL, thumb text, files jsonb DEFAULT '[]'::jsonb NOT NULL, published boolean DEFAULT false NOT NULL, by_wolf boolean DEFAULT false NOT NULL, note text DEFAULT ''::text NOT NULL, created_by text DEFAULT COALESCE((public.auth_jwt() ->> 'email'::text), ''::text) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.admin_kv (id text NOT NULL, data jsonb DEFAULT '{}'::jsonb NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.bz_designs (id text NOT NULL, user_id uuid DEFAULT public.auth_uid() NOT NULL, code text NOT NULL, product text, color text, face text, size text, orient text, idea text, style text, price numeric, img_path text, photo_path text, status text DEFAULT 'yeni'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.bz_usage (user_id uuid NOT NULL, day date DEFAULT ((now() AT TIME ZONE 'Europe/Istanbul'::text))::date NOT NULL, n integer DEFAULT 0 NOT NULL);
CREATE TABLE public.carts (mail text NOT NULL, ad text, tel text, items jsonb DEFAULT '[]'::jsonb NOT NULL, total numeric DEFAULT 0 NOT NULL, izin boolean DEFAULT false NOT NULL, member boolean DEFAULT false NOT NULL, status text DEFAULT 'bekliyor'::text NOT NULL, reminded_at timestamp with time zone, updated_at timestamp with time zone DEFAULT now() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, owner_key text, id uuid DEFAULT gen_random_uuid() NOT NULL);
CREATE TABLE public.crm_customers (email text NOT NULL, user_id uuid, ad text, tel text, il text, segment text DEFAULT 'yeni'::text NOT NULL, tags text[] DEFAULT '{}'::text[] NOT NULL, order_count integer DEFAULT 0 NOT NULL, total_spent numeric DEFAULT 0 NOT NULL, last_order_at timestamp with time zone, created_at timestamp with time zone DEFAULT now() NOT NULL, dogum text, dogum_yil integer);
CREATE TABLE public.crm_notes (id uuid DEFAULT gen_random_uuid() NOT NULL, customer_email text NOT NULL, kind text DEFAULT 'not'::text NOT NULL, body text NOT NULL, due_at timestamp with time zone, done boolean DEFAULT false NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.orders (id uuid DEFAULT gen_random_uuid() NOT NULL, code text NOT NULL, user_id uuid, guest boolean DEFAULT false NOT NULL, ad text, tel text, mail text, adres text, il text, ilce text, items jsonb DEFAULT '[]'::jsonb NOT NULL, subtotal numeric DEFAULT 0 NOT NULL, ship numeric DEFAULT 0 NOT NULL, total numeric DEFAULT 0 NOT NULL, status text DEFAULT 'yeni'::text NOT NULL, pay_status text DEFAULT 'bekliyor'::text NOT NULL, note text, created_at timestamp with time zone DEFAULT now() NOT NULL, special jsonb, school jsonb, doc_path text, doc_status text, channel text DEFAULT 'site'::text NOT NULL, ext_code text, fulfillment jsonb, onay jsonb, checkout_owner text);
CREATE TABLE public.profiles (id uuid NOT NULL, ad text, tel text, adres text, il text, ilce text, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, dogum text, dogum_yil integer);
CREATE TABLE public.reviews (id uuid DEFAULT gen_random_uuid() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, ad text NOT NULL, il text, puan integer NOT NULL, metin text NOT NULL, urun text, foto text, iletisim text, durum text DEFAULT 'bekliyor'::text NOT NULL, yanit text);
CREATE TABLE public.site_content (id text NOT NULL, data jsonb NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.site_search (day date NOT NULL, q text NOT NULL, n integer DEFAULT 0 NOT NULL, c integer DEFAULT 0 NOT NULL);
CREATE TABLE public.site_stats (day date NOT NULL, k text NOT NULL, n integer DEFAULT 0 NOT NULL);
CREATE TABLE public.stok_haber (id uuid DEFAULT gen_random_uuid() NOT NULL, kind text DEFAULT 'urun'::text NOT NULL, product_id text NOT NULL, product_name text DEFAULT ''::text NOT NULL, contact text NOT NULL, name text DEFAULT ''::text NOT NULL, user_email text DEFAULT lower(COALESCE((public.auth_jwt() ->> 'email'::text), ''::text)) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, notified_at timestamp with time zone);
CREATE TABLE public.toptan_ayar (id text NOT NULL, data jsonb DEFAULT '{}'::jsonb NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.toptan_basvuru (user_id uuid NOT NULL, mail text NOT NULL, firma text NOT NULL, vkn text NOT NULL, vergi_dairesi text NOT NULL, yetkili text, tel text, il text, adres text, faaliyet text, notu text, levha_path text, status text DEFAULT 'bekliyor'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, decided_at timestamp with time zone);
CREATE TABLE public.user_designs (id text NOT NULL, user_id uuid DEFAULT public.auth_uid() NOT NULL, sig text NOT NULL, bid text, label text, thumb text, data jsonb NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, used_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.wf_agenda (id uuid DEFAULT gen_random_uuid() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, revision integer DEFAULT 1 NOT NULL, "position" integer NOT NULL, title text NOT NULL, section text NOT NULL, assignee text NOT NULL, priority text NOT NULL, status text NOT NULL, notes text DEFAULT ''::text NOT NULL);
CREATE TABLE public.wf_ithalat (id uuid DEFAULT gen_random_uuid() NOT NULL, kind text NOT NULL, data jsonb DEFAULT '{}'::jsonb NOT NULL, created_by text DEFAULT COALESCE((public.auth_jwt() ->> 'email'::text), ''::text) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.wf_ithalat_log (id bigint DEFAULT nextval('wf_ithalat_log_id_seq'::regclass) NOT NULL, row_id uuid, kind text, action text NOT NULL, old_data jsonb, new_data jsonb, by_email text DEFAULT COALESCE((public.auth_jwt() ->> 'email'::text), ''::text) NOT NULL, at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.wf_kasa (id uuid DEFAULT gen_random_uuid() NOT NULL, folder text DEFAULT 'Diğer'::text NOT NULL, title text DEFAULT 'Adsız'::text NOT NULL, note text DEFAULT ''::text NOT NULL, file_path text, file_name text, mime text, size integer, created_by text DEFAULT COALESCE((public.auth_jwt() ->> 'email'::text), ''::text) NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.wf_staff (email text NOT NULL, name text DEFAULT ''::text NOT NULL, added_at timestamp with time zone DEFAULT now() NOT NULL);
CREATE TABLE public.wf_support_case (agenda_id uuid NOT NULL, customer_id uuid NOT NULL, design_id text NOT NULL, step text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);
ALTER TABLE public.admin_designs ADD CONSTRAINT admin_designs_pkey PRIMARY KEY (id);
ALTER TABLE public.admin_kv ADD CONSTRAINT admin_kv_pkey PRIMARY KEY (id);
ALTER TABLE public.bz_designs ADD CONSTRAINT bz_designs_pkey PRIMARY KEY (id);
ALTER TABLE public.bz_usage ADD CONSTRAINT bz_usage_pkey PRIMARY KEY (user_id, day);
ALTER TABLE public.carts ADD CONSTRAINT carts_pkey PRIMARY KEY (id);
ALTER TABLE public.crm_customers ADD CONSTRAINT crm_customers_pkey PRIMARY KEY (email);
ALTER TABLE public.crm_notes ADD CONSTRAINT crm_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.orders ADD CONSTRAINT orders_code_key UNIQUE (code);
ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.reviews ADD CONSTRAINT reviews_metin_check CHECK (((char_length(metin) >= 10) AND (char_length(metin) <= 800)));
ALTER TABLE public.site_content ADD CONSTRAINT site_content_pkey PRIMARY KEY (id);
ALTER TABLE public.site_search ADD CONSTRAINT site_search_pkey PRIMARY KEY (day, q);
ALTER TABLE public.site_stats ADD CONSTRAINT site_stats_pkey PRIMARY KEY (day, k);
ALTER TABLE public.stok_haber ADD CONSTRAINT stok_haber_pkey PRIMARY KEY (id);
ALTER TABLE public.toptan_ayar ADD CONSTRAINT toptan_ayar_pkey PRIMARY KEY (id);
ALTER TABLE public.toptan_basvuru ADD CONSTRAINT toptan_basvuru_pkey PRIMARY KEY (user_id);
ALTER TABLE public.user_designs ADD CONSTRAINT user_designs_pkey PRIMARY KEY (id);
ALTER TABLE public.user_designs ADD CONSTRAINT user_designs_user_id_sig_key UNIQUE (user_id, sig);
ALTER TABLE public.wf_agenda ADD CONSTRAINT wf_agenda_pkey PRIMARY KEY (id);
ALTER TABLE public.wf_ithalat_log ADD CONSTRAINT wf_ithalat_log_pkey PRIMARY KEY (id);
ALTER TABLE public.wf_ithalat ADD CONSTRAINT wf_ithalat_pkey PRIMARY KEY (id);
ALTER TABLE public.wf_kasa ADD CONSTRAINT wf_kasa_pkey PRIMARY KEY (id);
ALTER TABLE public.wf_staff ADD CONSTRAINT wf_staff_pkey PRIMARY KEY (email);
ALTER TABLE public.wf_support_case ADD CONSTRAINT wf_support_case_pkey PRIMARY KEY (agenda_id);
ALTER TABLE public.bz_designs ADD CONSTRAINT bz_designs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_users(id) ON DELETE CASCADE;
ALTER TABLE public.bz_usage ADD CONSTRAINT bz_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_users(id) ON DELETE CASCADE;
ALTER TABLE public.crm_customers ADD CONSTRAINT crm_customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_users(id) ON DELETE SET NULL;
ALTER TABLE public.crm_notes ADD CONSTRAINT crm_notes_customer_email_fkey FOREIGN KEY (customer_email) REFERENCES crm_customers(email) ON DELETE CASCADE;
ALTER TABLE public.orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_users(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.auth_users(id) ON DELETE CASCADE;
ALTER TABLE public.user_designs ADD CONSTRAINT user_designs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.auth_users(id) ON DELETE CASCADE;
ALTER TABLE public.wf_support_case ADD CONSTRAINT wf_support_case_agenda_id_fkey FOREIGN KEY (agenda_id) REFERENCES wf_agenda(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX carts_owner_key_idx ON public.carts USING btree (owner_key);
CREATE UNIQUE INDEX stok_haber_one_open ON public.stok_haber USING btree (product_id, user_email) WHERE (notified_at IS NULL);

CREATE FUNCTION public.bz_refund(p_uid uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $function$
  update public.bz_usage set n = greatest(n - 1, 0) where user_id = p_uid and day = (now() at time zone 'Europe/Istanbul')::date; $function$;
CREATE FUNCTION public.bz_take(p_uid uuid, p_lim integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare d date := (now() at time zone 'Europe/Istanbul')::date; c int;
begin
  insert into public.bz_usage(user_id, day, n) values (p_uid, d, 0) on conflict do nothing;
  update public.bz_usage set n = n + 1 where user_id = p_uid and day = d and n < p_lim returning n into c;
  return c is not null;
end $function$;
CREATE FUNCTION public.crm_on_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare e text := lower(coalesce(new.mail,''));
begin
  if e = '' then return new; end if;
  insert into public.crm_customers(email, user_id, ad, tel, il, order_count, total_spent, last_order_at, segment)
  values (e, new.user_id, new.ad, new.tel, new.il, 1, new.total, new.created_at, 'müşteri')
  on conflict (email) do update set order_count = public.crm_customers.order_count + 1, total_spent = public.crm_customers.total_spent + excluded.total_spent, last_order_at = excluded.last_order_at;
  return new;
end $function$;
CREATE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
begin
  insert into public.profiles (id, ad) values (new.id, coalesce(new.raw_user_meta_data->>'name', '')) on conflict (id) do nothing;
  return new;
end; $function$;
CREATE FUNCTION public.is_toptan() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  select exists(select 1 from public.toptan_basvuru where user_id = public.auth_uid() and status = 'onaylandı'); $function$;
CREATE FUNCTION public.is_wf_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  select coalesce(public.auth_jwt() ->> 'email','') = 'sahip@ornek.com'
      or exists (select 1 from public.wf_staff s where s.email = lower(coalesce(public.auth_jwt() ->> 'email',''))) $function$;
CREATE FUNCTION public.is_wf_owner() RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $function$
  select coalesce(public.auth_jwt() ->> 'email','') = 'sahip@ornek.com' $function$;
CREATE FUNCTION public.user_designs_tidy() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
begin
  delete from public.user_designs where used_at < now() - interval '1 year';
  delete from public.user_designs where user_id = new.user_id and id in (
    select id from public.user_designs where user_id = new.user_id and sig <> new.sig order by used_at desc offset 29);
  return new;
end $function$;
CREATE FUNCTION public.wf_hit(p_keys text[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare v_day date := (now() at time zone 'Europe/Istanbul')::date; v_key text; v_cnt int;
begin
  if p_keys is null or coalesce(array_length(p_keys,1),0) > 8 then return; end if;
  select count(*) into v_cnt from public.site_stats s where s.day = v_day;
  foreach v_key in array p_keys loop
    if v_key ~ '^(v|pv|p:[a-z0-9-]{1,20}|e:[a-z0-9-]{1,20}|d:(mobil|masaustu))$' then
      insert into public.site_stats as s (day, k, n) values (v_day, v_key, 1) on conflict on constraint site_stats_pkey do update set n = s.n + 1;
    end if;
  end loop;
end $function$;
CREATE FUNCTION public.wf_reviews() RETURNS TABLE(id uuid, created_at timestamp with time zone, ad text, il text, puan integer, metin text, urun text, foto text, yanit text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  select r.id, r.created_at, r.ad, r.il, r.puan, r.metin, r.urun, r.foto, r.yanit from public.reviews r where r.durum = 'yayinda' order by r.created_at desc limit 60 $function$;
CREATE FUNCTION public.wf_review_add(p_ad text, p_il text, p_puan integer, p_metin text, p_urun text, p_foto text, p_iletisim text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
begin
  insert into public.reviews(ad,il,puan,metin,urun,foto,iletisim) values (trim(p_ad), nullif(trim(p_il),''), p_puan, trim(p_metin), nullif(trim(p_urun),''), nullif(p_foto,''), nullif(trim(p_iletisim),''));
  return true;
end $function$;
CREATE FUNCTION public.wf_toptan_gizli() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$ select coalesce(data->'hide','[]'::jsonb) from toptan_ayar where id='main' $function$;
CREATE FUNCTION public.stok_haber_kick() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
begin
  if exists (select 1 from public.stok_haber where notified_at is null) then
    perform wf_jobs_private.wf_run_job('stok-haber');
  end if;
  return new;
end $function$;
CREATE TRIGGER crm_on_order_trg AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.crm_on_order();
CREATE TRIGGER user_designs_tidy BEFORE INSERT ON public.user_designs FOR EACH ROW EXECUTE FUNCTION public.user_designs_tidy();
CREATE TRIGGER site_content_stok_haber AFTER UPDATE ON public.site_content FOR EACH ROW EXECUTE FUNCTION public.stok_haber_kick();
DO $$ DECLARE r record; BEGIN FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'auth_users' LOOP EXECUTE 'ALTER TABLE public.'||quote_ident(r.tablename)||' ENABLE ROW LEVEL SECURITY'; END LOOP; END $$;
INSERT INTO public.site_content(id,data) VALUES ('main','{"logo":"https://wgovwmeirlzwalelazfj.supabase.co/storage/v1/object/public/site/img/logo.png","ship":{"fee":100,"free":2000},"vat":{"mode":"incl"},"products":[{"id":"p1","name":"Erkek Tişört W001","price":750,"cat":["erkek"],"type":"tişört"}],"blanks":[]}');
INSERT INTO public.wf_staff(email,name) VALUES ('personel@ornek.com','Test');
INSERT INTO public.reviews(ad,puan,metin,durum) VALUES ('Ali',5,'Çok güzel bir ürün','yayinda'),('Veli',3,'Gizli kalacak yorum','bekliyor');
INSERT INTO public.profiles(id,ad) VALUES ('0a65f122-dcdb-4f5c-afab-12f1b767f96e','Üye'),('554778a7-9d6a-49db-9c63-bd3f42a824e6','Sahip');
