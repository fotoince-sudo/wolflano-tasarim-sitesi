-- Yöneticinin kaydettiği zeminler (kind = 'zemin') şablonlar gibi herkese okunur
drop policy if exists "admin designs public templates" on public.admin_designs;
create policy "admin designs public templates" on public.admin_designs for select to anon, authenticated using (kind in ('sablon','zemin') and published);
