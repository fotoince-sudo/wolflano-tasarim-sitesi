-- Toptan: firma başvurusu (vergi levhalı firmalar; yönetici onaylar) ve toptan ayarları (adet kademeleri, indirim oranları; yalnız onaylı firma ve yönetici okur)
create table if not exists public.toptan_basvuru(
  user_id uuid primary key, mail text not null, firma text not null, vkn text not null, vergi_dairesi text not null,
  yetkili text, tel text, il text, adres text, faaliyet text, notu text, levha_path text,
  status text not null default 'bekliyor', created_at timestamptz not null default now(), decided_at timestamptz
);
alter table public.toptan_basvuru enable row level security;
create policy "toptan basvuru own read" on public.toptan_basvuru for select to authenticated using (user_id = (select auth.uid()) or public.is_wf_admin());
create policy "toptan basvuru admin write" on public.toptan_basvuru for update to authenticated using (public.is_wf_admin()) with check (public.is_wf_admin());
create or replace function public.is_toptan() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.toptan_basvuru where user_id = auth.uid() and status = 'onaylandı');
$$;
create table if not exists public.toptan_ayar(id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
alter table public.toptan_ayar enable row level security;
create policy "toptan ayar read" on public.toptan_ayar for select to authenticated using (public.is_toptan() or public.is_wf_admin());
create policy "toptan ayar admin" on public.toptan_ayar for all to authenticated using (public.is_wf_admin()) with check (public.is_wf_admin());
