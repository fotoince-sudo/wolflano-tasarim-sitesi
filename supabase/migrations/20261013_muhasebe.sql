-- Muhasebe kayıtları (yalnız yönetici)
create table if not exists public.muhasebe (
  id uuid primary key default gen_random_uuid(),
  doc jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.muhasebe enable row level security;
drop policy if exists "muhasebe admin all" on public.muhasebe;
create policy "muhasebe admin all" on public.muhasebe for all to authenticated using (public.is_wf_admin()) with check (public.is_wf_admin());
