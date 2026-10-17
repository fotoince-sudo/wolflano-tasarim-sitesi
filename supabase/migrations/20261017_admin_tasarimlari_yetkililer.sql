-- Yetkili kişiler: yalnız site sahibi ekleyip çıkarır
create table if not exists public.wf_staff(
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  name text not null default '',
  added_at timestamptz not null default now()
);
alter table public.wf_staff enable row level security;

create or replace function public.is_wf_owner() returns boolean language sql stable set search_path to '' as $$
  select coalesce(auth.jwt() ->> 'email','') = 'ergunince68@hotmail.com'
$$;

-- Yönetici: site sahibi veya yetkili listesindeki e-posta (yalnız çağıranın kendisi için true/false döner)
create or replace function public.is_wf_admin() returns boolean language sql stable security definer set search_path to '' as $$
  select coalesce(auth.jwt() ->> 'email','') = 'ergunince68@hotmail.com'
      or exists (select 1 from public.wf_staff s where s.email = lower(coalesce(auth.jwt() ->> 'email','')))
$$;
revoke all on function public.is_wf_admin() from public;
grant execute on function public.is_wf_admin() to anon, authenticated;

create policy "staff owner all" on public.wf_staff for all to authenticated using (public.is_wf_owner()) with check (public.is_wf_owner());
create policy "staff self read" on public.wf_staff for select to authenticated using (email = lower(coalesce(auth.jwt() ->> 'email','')));

-- Admin tasarımları: şablon, ürün ve baskı işleri
create table if not exists public.admin_designs(
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Adsız tasarım',
  kind text not null default 'taslak' check (kind in ('taslak','sablon','urun','baski')),
  status text not null default 'yeni',
  product text, cut text, color text,
  qty int not null default 0,
  sizes jsonb not null default '{}'::jsonb,
  data jsonb not null default '{}'::jsonb,
  thumb text,
  files jsonb not null default '[]'::jsonb,
  published boolean not null default false,
  by_wolf boolean not null default false,
  note text not null default '',
  created_by text not null default coalesce(auth.jwt() ->> 'email',''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_designs enable row level security;
create policy "admin designs admin all" on public.admin_designs for all to authenticated using (public.is_wf_admin()) with check (public.is_wf_admin());
create policy "admin designs public templates" on public.admin_designs for select to anon, authenticated using (kind = 'sablon' and published);
create index if not exists admin_designs_kind_idx on public.admin_designs(kind, created_at desc);
