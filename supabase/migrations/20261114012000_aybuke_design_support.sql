create table public.wf_support_case (
  agenda_id uuid primary key references public.wf_agenda(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  design_id text not null references public.user_designs(id) on delete cascade,
  step text not null check (step in ('photo','wolf','cart')),
  created_at timestamptz not null default now()
);
alter table public.wf_support_case enable row level security;
revoke all on public.wf_support_case from public, anon, authenticated;
grant select on public.wf_support_case to authenticated;
create policy wf_support_owner on public.wf_support_case for select to authenticated using ((select public.is_wf_owner()));

create function public.wf_request_design_support(p_design_id text,p_step text,p_request text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  customer uuid := auth.uid();
  task uuid;
  product text;
begin
  if customer is null or p_step is null or p_step not in ('photo','wolf','cart') then
    raise exception 'Invalid support request';
  end if;
  select coalesce(d.label,'Stüdyo tasarımı') into product from public.user_designs d
    where d.id=p_design_id and d.user_id=customer;
  if not found then raise exception 'Design unavailable'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(customer::text,0));
  select c.agenda_id into task from public.wf_support_case c join public.wf_agenda a on a.id=c.agenda_id
    where c.customer_id=customer and c.design_id=p_design_id and c.step=p_step and a.status<>'Tamamlandı'
    order by c.created_at desc limit 1;
  if found then return task; end if;
  if (select count(*) from public.wf_support_case c where c.customer_id=customer and c.created_at>now()-interval '1 hour')>=5 then
    raise exception 'Support request rate limit';
  end if;
  insert into public.wf_agenda(position,title,section,assignee,priority,status,notes)
  values(9999,'Aybüke · Tasarım desteği','Kendin Tasarla motoru','Codex','Orta','Bekliyor',
    'Ürün: '||left(product,160)||chr(10)||'Adım: '||
    case p_step when 'photo' then 'Fotoğraf yerleştirme tamamlanamadı' when 'wolf' then 'Wolf çizimi tamamlanamadı' else 'Sepete ekleme tamamlanamadı' end||
    chr(10)||'Müşteri isteği: '||left(coalesce(p_request,''),400))
  returning id into task;
  insert into public.wf_support_case(agenda_id,customer_id,design_id,step) values(task,customer,p_design_id,p_step);
  return task;
end;
$$;
revoke all on function public.wf_request_design_support(text,text,text) from public, anon, authenticated;
grant execute on function public.wf_request_design_support(text,text,text) to authenticated;
