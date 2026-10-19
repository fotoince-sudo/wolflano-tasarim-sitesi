-- Stoğa gelince haber ver: müşteri stokta olmayan ürün için iletişim bırakır, yönetici ürün gelince haber verir
create table if not exists public.stok_haber(
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'urun' check (kind in ('urun','baski')),
  product_id text not null check (length(product_id) between 1 and 80),
  product_name text not null default '' check (length(product_name) <= 160),
  contact text not null check (length(contact) between 5 and 120),
  name text not null default '' check (length(name) <= 120),
  user_email text not null default coalesce(auth.jwt() ->> 'email',''),
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
alter table public.stok_haber enable row level security;
create policy "stok haber anyone insert" on public.stok_haber for insert to anon, authenticated with check (notified_at is null);
create policy "stok haber admin all" on public.stok_haber for all to authenticated using (public.is_wf_admin()) with check (public.is_wf_admin());
create index if not exists stok_haber_open_idx on public.stok_haber(product_id) where notified_at is null;

-- Yalnız üyeler kayıt bırakır; kendi kayıtlarını görür. Aynı ürün için tek açık kayıt.
drop policy if exists "stok haber anyone insert" on public.stok_haber;
create policy "stok haber member insert" on public.stok_haber for insert to authenticated
  with check (notified_at is null and user_email = lower(coalesce(auth.jwt() ->> 'email','')) and contact = user_email);
create policy "stok haber own read" on public.stok_haber for select to authenticated
  using (user_email = lower(coalesce(auth.jwt() ->> 'email','')));
alter table public.stok_haber alter column user_email set default lower(coalesce(auth.jwt() ->> 'email',''));
create unique index if not exists stok_haber_one_open on public.stok_haber(product_id, user_email) where notified_at is null;

-- Ürünler kaydedilince (stok girilince) e-posta gönderen fonksiyonu tetikle; saatte bir de yeniden dener
create extension if not exists pg_net;
create or replace function public.stok_haber_kick() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.stok_haber where notified_at is null) then
    perform net.http_post(url := 'https://wgovwmeirlzwalelazfj.supabase.co/functions/v1/stok-haber',
      body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb);
  end if;
  return new;
end $$;
drop trigger if exists site_content_stok_haber on public.site_content;
create trigger site_content_stok_haber after update on public.site_content
  for each row when (new.id = 'main') execute function public.stok_haber_kick();

create extension if not exists pg_cron;
select cron.schedule('stok-haber-saatlik', '7 * * * *', $$
  select net.http_post(url := 'https://wgovwmeirlzwalelazfj.supabase.co/functions/v1/stok-haber',
    body := '{}'::jsonb, headers := '{"Content-Type":"application/json"}'::jsonb)
  where exists (select 1 from public.stok_haber where notified_at is null)
$$);
