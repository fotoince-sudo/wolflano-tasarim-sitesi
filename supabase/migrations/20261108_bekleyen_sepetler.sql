-- Bekleyen sepetler: e-postası bilinen müşterinin sepeti (üye ya da ödeme ekranında e-postasını yazmış). Yalnız yönetici okur.
create table if not exists public.carts(
  mail text primary key, ad text, tel text,
  items jsonb not null default '[]'::jsonb, total numeric not null default 0,
  izin boolean not null default false, member boolean not null default false,
  status text not null default 'bekliyor', reminded_at timestamptz,
  updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
alter table public.carts enable row level security;
drop policy if exists "carts admin all" on public.carts;
create policy "carts admin all" on public.carts for all to authenticated using (public.is_wf_admin()) with check (public.is_wf_admin());
create index if not exists carts_upd_idx on public.carts(status, updated_at desc);
