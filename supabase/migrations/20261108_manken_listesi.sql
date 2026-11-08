-- Stüdyoda yönetici için manken fotoğraf listesi (fotoğraflar zaten herkese açık)
create or replace function public.wf_mankenler() returns setof text language sql stable security definer set search_path=public,storage as $$ select name from storage.objects where bucket_id='site' and name like 'img/manken-%' order by name $$;
revoke all on function public.wf_mankenler() from public;
grant execute on function public.wf_mankenler() to anon, authenticated;
