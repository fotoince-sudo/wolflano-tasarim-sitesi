-- PROPOSAL ONLY. Not applied. Requires review of live constraints, Vault and cron first.
-- No customer/order rows are updated or deleted. Legacy carts retain NULL ownership.
begin;
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name='wf_job_token' and length(decrypted_secret)>=32) then
    raise exception 'Provision wf_job_token in Vault and matching WF_JOB_TOKEN in Edge secrets before applying';
  end if;
end $$;
alter table public.carts add column if not exists owner_key text;
-- Email is contact information, not a cart identifier. RESTRICT deliberately fails if referenced.
alter table public.carts drop constraint if exists carts_pkey;
-- A stable identity also covers pre-migration carts whose owner_key is NULL.
alter table public.carts add column if not exists id uuid not null default gen_random_uuid();
alter table public.carts add primary key (id);
create unique index if not exists carts_owner_key_idx on public.carts(owner_key);
create index if not exists carts_mail_idx on public.carts(mail);
alter table public.carts add constraint carts_owner_key_format
  check (owner_key is null or owner_key ~ '^g:[a-f0-9]{64}$' or owner_key ~ '^u:[0-9a-f-]{36}$');
alter table public.orders add column if not exists checkout_owner text;
create index if not exists orders_checkout_owner_idx on public.orders(checkout_owner, created_at desc);

-- Existing carts RLS remains admin-only; browsers never receive direct table access.
-- Provision matching WF_JOB_TOKEN in Edge Function secrets and Vault separately, after approval.
-- Vault name: wf_job_token. Never store the token in migrations or in cron.job.command.
create schema if not exists wf_jobs_private;
revoke all on schema wf_jobs_private from public, anon, authenticated;
create or replace function wf_jobs_private.wf_run_job(job_name text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  if job_name not in ('stok-haber','dogum-gunu') then raise exception 'unsupported job'; end if;
  select decrypted_secret into token from vault.decrypted_secrets where name = 'wf_job_token' limit 1;
  if token is null or length(token) < 32 then raise exception 'wf_job_token is not configured'; end if;
  return net.http_post(
    url := 'https://wgovwmeirlzwalelazfj.supabase.co/functions/v1/' || job_name,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-wf-job-token',token));
end $$;
revoke all on function wf_jobs_private.wf_run_job(text) from public, anon, authenticated;

create or replace function public.stok_haber_kick()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.stok_haber where notified_at is null) then
    perform wf_jobs_private.wf_run_job('stok-haber');
  end if;
  return new;
end $$;
revoke all on function public.stok_haber_kick() from public, anon, authenticated;

-- Retain the existing hourly job name/time. Update an existing birthday job's command only;
-- if no matching job exists, don't guess its live schedule or create a second sender.
select cron.schedule('stok-haber-saatlik', '7 * * * *',
  $$select wf_jobs_private.wf_run_job('stok-haber') where exists (select 1 from public.stok_haber where notified_at is null)$$);
do $$
declare task record;
begin
  for task in select jobid from cron.job where command like '%/functions/v1/dogum-gunu%'
  loop
    perform cron.alter_job(task.jobid, command := $cmd$select wf_jobs_private.wf_run_job('dogum-gunu')$cmd$);
  end loop;
end $$;
commit;
