-- ── Storage Buckets ──────────────────────────────────────────────────────────
-- Run this in the Supabase SQL editor

-- Bucket para fotos da Comunidade (posts do feed social)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'social-images',
  'social-images',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Políticas do bucket social-images
create policy "Public read social-images"
  on storage.objects for select
  using (bucket_id = 'social-images');

create policy "Auth upload social-images"
  on storage.objects for insert
  with check (bucket_id = 'social-images' and auth.uid() is not null);

create policy "Own delete social-images"
  on storage.objects for delete
  using (bucket_id = 'social-images' and auth.uid()::text = (storage.foldername(name))[1]);

-- Bucket para fotos de capturas de pesca (já pode existir)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catches',
  'catches',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Public read catches"
  on storage.objects for select
  using (bucket_id = 'catches');

create policy "Auth upload catches"
  on storage.objects for insert
  with check (bucket_id = 'catches' and auth.uid() is not null);

create policy "Own delete catches"
  on storage.objects for delete
  using (bucket_id = 'catches' and auth.uid()::text = (storage.foldername(name))[1]);
