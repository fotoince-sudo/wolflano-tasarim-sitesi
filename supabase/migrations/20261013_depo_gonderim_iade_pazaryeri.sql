-- Depo ve gönderim, iadeler, pazaryeri siparişleri
alter table public.orders add column if not exists channel text not null default 'site';
alter table public.orders add column if not exists ext_code text;
alter table public.orders add column if not exists fulfillment jsonb;

drop policy if exists "orders admin insert" on public.orders;
create policy "orders admin insert" on public.orders for insert to authenticated with check (public.is_wf_admin());

create table if not exists public.returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  order_code text,
  customer text,
  items text,
  reason text,
  status text not null default 'talep',
  provider text,
  tracking_no text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.returns enable row level security;
drop policy if exists "returns admin all" on public.returns;
create policy "returns admin all" on public.returns for all to authenticated using (public.is_wf_admin()) with check (public.is_wf_admin());

create table if not exists public.admin_kv (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.admin_kv enable row level security;
drop policy if exists "admin kv all" on public.admin_kv;
create policy "admin kv all" on public.admin_kv for all to authenticated using (public.is_wf_admin()) with check (public.is_wf_admin());
