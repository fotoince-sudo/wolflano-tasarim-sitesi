-- Kasa: şirket evrakı, şartnameler, strateji notları. Yalnız site sahibi görür.
create table if not exists public.wf_kasa(
  id uuid primary key default gen_random_uuid(),
  folder text not null default 'Diğer',
  title text not null default 'Adsız',
  note text not null default '',
  file_path text,
  file_name text,
  mime text,
  size int,
  created_by text not null default coalesce(auth.jwt() ->> 'email',''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wf_kasa enable row level security;
create policy "kasa owner all" on public.wf_kasa for all to authenticated using (public.is_wf_owner()) with check (public.is_wf_owner());
create index if not exists wf_kasa_folder_idx on public.wf_kasa(folder, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit)
values ('kasa','kasa', false, 26214400)
on conflict (id) do nothing;
create policy "kasa files owner select" on storage.objects for select to authenticated using (bucket_id = 'kasa' and public.is_wf_owner());
create policy "kasa files owner insert" on storage.objects for insert to authenticated with check (bucket_id = 'kasa' and public.is_wf_owner());
create policy "kasa files owner update" on storage.objects for update to authenticated using (bucket_id = 'kasa' and public.is_wf_owner());
create policy "kasa files owner delete" on storage.objects for delete to authenticated using (bucket_id = 'kasa' and public.is_wf_owner());
