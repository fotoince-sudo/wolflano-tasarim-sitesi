-- Müşterinin kaydettiği tasarımlar (hesabına bağlı). Son açılıştan itibaren 1 yıl saklanır; hesap başına en fazla 30.
create table if not exists public.user_designs (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sig text not null,
  bid text,
  label text,
  thumb text,
  data jsonb not null,
  created_at timestamptz not null default now(),
  used_at timestamptz not null default now(),
  unique (user_id, sig)
);
alter table public.user_designs enable row level security;
drop policy if exists "user designs own" on public.user_designs;
create policy "user designs own" on public.user_designs for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "user designs admin read" on public.user_designs;
create policy "user designs admin read" on public.user_designs for select using (public.is_wf_admin());

create or replace function public.user_designs_tidy() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  delete from public.user_designs where used_at < now() - interval '1 year';
  delete from public.user_designs where user_id = new.user_id and id in (
    select id from public.user_designs where user_id = new.user_id and sig <> new.sig order by used_at desc offset 29);
  return new;
end $$;
drop trigger if exists user_designs_tidy on public.user_designs;
create trigger user_designs_tidy before insert on public.user_designs for each row execute function public.user_designs_tidy();
