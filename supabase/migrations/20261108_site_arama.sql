-- Site içi arama istatistiği: ziyaretçinin aradığı kelime günlük sayılır (kim aradığı tutulmaz).
create table if not exists public.site_search (
  day date not null,
  q text not null,
  n int not null default 0,      -- son aramada çıkan sonuç sayısı
  c int not null default 0,      -- o gün kaç kez arandı
  primary key (day, q)
);
alter table public.site_search enable row level security;
drop policy if exists "site search admin read" on public.site_search;
create policy "site search admin read" on public.site_search for select using (public.is_wf_admin());

create or replace function public.wf_ara(p_q text, p_n int)
returns void language plpgsql security definer set search_path to '' as $$
declare v_day date := (now() at time zone 'Europe/Istanbul')::date; v_q text; v_cnt int;
begin
  v_q := left(regexp_replace(lower(coalesce(p_q,'')), '[^a-z0-9 ]', '', 'g'), 60);
  v_q := btrim(regexp_replace(v_q, '\s+', ' ', 'g'));
  if length(v_q) < 3 then return; end if;
  select count(*) into v_cnt from public.site_search s where s.day = v_day;
  if v_cnt < 500 then
    insert into public.site_search as s (day, q, n, c) values (v_day, v_q, greatest(0, least(coalesce(p_n,0), 9999)), 1)
    on conflict (day, q) do update set c = s.c + 1, n = excluded.n;
  else
    update public.site_search s set c = s.c + 1, n = greatest(0, least(coalesce(p_n,0), 9999)) where s.day = v_day and s.q = v_q;
  end if;
end $$;
revoke all on function public.wf_ara(text,int) from public;
grant execute on function public.wf_ara(text,int) to anon, authenticated;
