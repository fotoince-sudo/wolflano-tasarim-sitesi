begin;
create table public.wf_agenda (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  position integer not null check (position between 1 and 9999),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  section text not null check (section in ('Wolflano sitesi','Kendin Tasarla motoru','Baskı hazırlığı','Tedarik araştırmaları')),
  assignee text not null check (assignee in ('Patron','Müdür','Codex','Copilot')),
  priority text not null check (priority in ('Yüksek','Orta','Düşük')),
  status text not null check (status in ('Bekliyor','Devam Ediyor','Kontrol Bekliyor','Tamamlandı')),
  checked_on date,
  notes text not null default '' check (char_length(notes) <= 8000),
  links text not null default '' check (char_length(links) <= 3000),
  decision text not null default '' check (char_length(decision) <= 2000),
  preview_url text not null default '' check (char_length(preview_url) <= 2000 and (preview_url = '' or preview_url ~ '^https://[^[:space:]]+$')),
  approved boolean not null default false,
  check (not approved or preview_url <> ''),
  check (status <> 'Tamamlandı' or approved)
);
alter table public.wf_agenda enable row level security;
revoke all on public.wf_agenda from public, anon, authenticated;
grant select, insert, update on public.wf_agenda to authenticated;
create policy wf_agenda_owner on public.wf_agenda for all to authenticated
  using ((select public.is_wf_owner()))
  with check ((select public.is_wf_owner()));
commit;
