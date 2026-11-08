-- Sipariş onayları (KVKK, sözleşme, pazarlama izni; zaman ve IP)
alter table public.orders add column if not exists onay jsonb;
