-- Görsel yüklemede "x-upsert" kullanıldığı için yöneticinin site kovasını okuyabilmesi gerekir.
create policy "site media admin select" on storage.objects for select to authenticated
  using (bucket_id = 'site' and public.is_wf_admin());
