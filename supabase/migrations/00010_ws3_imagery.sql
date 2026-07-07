-- ============================================================
-- WS3: product imagery + colour swatches (design doc v2 §8).
--
-- - products / awning_products gain an optional image_url (public URL,
--   normally pointing into the product-images storage bucket).
-- - catalog colours gain an optional hex_code for swatch chips and the
--   window diagram.
-- - Storage bucket `product-images`: public read, admin-only write.
-- ============================================================

alter table public.products
  add column if not exists image_url text;

alter table public.awning_products
  add column if not exists image_url text;

alter table public.colours
  add column if not exists hex_code text;

-- Storage bucket for product photography.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "product_images_admin_insert" on storage.objects;
create policy "product_images_admin_insert" on storage.objects
  for insert with check (
    bucket_id = 'product-images' and public.get_user_role() = 'administrator'
  );

drop policy if exists "product_images_admin_update" on storage.objects;
create policy "product_images_admin_update" on storage.objects
  for update using (
    bucket_id = 'product-images' and public.get_user_role() = 'administrator'
  );

drop policy if exists "product_images_admin_delete" on storage.objects;
create policy "product_images_admin_delete" on storage.objects
  for delete using (
    bucket_id = 'product-images' and public.get_user_role() = 'administrator'
  );

-- Seed hex codes for the existing catalog colours so swatches render
-- immediately. Admins can adjust from Admin → Catalog.
update public.colours set hex_code = c.hex
from (values
  ('white', '#f8fafc'),
  ('off-white', '#f5f0e8'),
  ('cream', '#f3e9d2'),
  ('beige', '#d9c8a9'),
  ('linen', '#eee6d8'),
  ('sand', '#d6c29a'),
  ('taupe', '#b7a68e'),
  ('grey', '#9ca3af'),
  ('gray', '#9ca3af'),
  ('light grey', '#c9ced6'),
  ('charcoal', '#3f3f46'),
  ('black', '#18181b'),
  ('brown', '#7c5c3e'),
  ('chocolate', '#5b3a29'),
  ('navy', '#1e3a5f'),
  ('blue', '#3b82a0'),
  ('green', '#4a7c59'),
  ('red', '#a03b3b'),
  ('burgundy', '#6d2233'),
  ('silver', '#c0c5cc')
) as c(name, hex)
where lower(public.colours.name) = c.name
  and public.colours.hex_code is null;
