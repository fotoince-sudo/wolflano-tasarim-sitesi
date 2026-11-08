-- Toptanda gizlenen ürün listesi herkese okunur (fiyat ve diğer ayarlar gizli kalır)
create or replace function public.wf_toptan_gizli() returns jsonb language sql stable security definer set search_path=public as $$ select coalesce(data->'hide','[]'::jsonb) from toptan_ayar where id='main' $$;
revoke all on function public.wf_toptan_gizli() from public;
grant execute on function public.wf_toptan_gizli() to anon, authenticated;
