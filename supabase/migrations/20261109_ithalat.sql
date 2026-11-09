-- İthalat hesaplayıcı: GTİP vergi oranları kütüphanesi ve kaydedilen maliyet hesapları.
-- Maliyet bilgisi şirket içidir: yalnız yönetici ve yetkililer (is_wf_admin) okur/yazar, muhasebe ile aynı.
create table if not exists public.wf_ithalat(
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('gtip','hesap')),
  data jsonb not null default '{}'::jsonb,
  created_by text not null default coalesce(auth.jwt() ->> 'email',''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wf_ithalat enable row level security;
drop policy if exists "ithalat admin all" on public.wf_ithalat;
create policy "ithalat admin all" on public.wf_ithalat for all to authenticated using (public.is_wf_admin()) with check (public.is_wf_admin());
create index if not exists wf_ithalat_kind_idx on public.wf_ithalat(kind, created_at desc);
