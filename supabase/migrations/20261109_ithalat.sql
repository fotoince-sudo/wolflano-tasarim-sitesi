-- İthalat maliyet merkezi: GTİP vergi oranları, tedarikçi teklifleri ve kaydedilen maliyet hesapları.
-- Maliyet bilgisi şirket içidir: yalnız yönetici ve yetkililer (is_wf_admin) okur/yazar, muhasebe ile aynı.
create table if not exists public.wf_ithalat(
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('gtip','hesap','teklif')),
  data jsonb not null default '{}'::jsonb,
  created_by text not null default coalesce(auth.jwt() ->> 'email',''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wf_ithalat enable row level security;
drop policy if exists "ithalat admin all" on public.wf_ithalat;
create policy "ithalat admin all" on public.wf_ithalat for all to authenticated using (public.is_wf_admin()) with check (public.is_wf_admin());
create index if not exists wf_ithalat_kind_idx on public.wf_ithalat(kind, created_at desc);

-- İşlem geçmişi: oran ve teklif değişiklikleri (kim, ne zaman, eski/yeni hali). Yalnız tetikleyici yazar, yönetici okur.
create table if not exists public.wf_ithalat_log(
  id bigserial primary key,
  row_id uuid,
  kind text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  by_email text not null default coalesce(auth.jwt() ->> 'email',''),
  at timestamptz not null default now()
);
alter table public.wf_ithalat_log enable row level security;
drop policy if exists "ithalat log admin read" on public.wf_ithalat_log;
create policy "ithalat log admin read" on public.wf_ithalat_log for select to authenticated using (public.is_wf_admin());
create index if not exists wf_ithalat_log_at_idx on public.wf_ithalat_log(at desc);

create or replace function public.wf_ithalat_logla() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if tg_op = 'DELETE' then
    if old.kind in ('gtip','teklif') then insert into public.wf_ithalat_log(row_id,kind,action,old_data) values (old.id,old.kind,'sil',old.data); end if;
    return old;
  elsif tg_op = 'UPDATE' then
    if new.kind in ('gtip','teklif') and new.data is distinct from old.data then insert into public.wf_ithalat_log(row_id,kind,action,old_data,new_data) values (new.id,new.kind,'degistir',old.data,new.data); end if;
    return new;
  else
    if new.kind in ('gtip','teklif') then insert into public.wf_ithalat_log(row_id,kind,action,new_data) values (new.id,new.kind,'ekle',new.data); end if;
    return new;
  end if;
end $$;
drop trigger if exists wf_ithalat_log_trg on public.wf_ithalat;
create trigger wf_ithalat_log_trg after insert or update or delete on public.wf_ithalat for each row execute function public.wf_ithalat_logla();
