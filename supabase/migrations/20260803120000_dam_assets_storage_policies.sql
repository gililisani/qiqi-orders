-- dam-assets bucket policies, TRACKED at last. The originals were created in
-- the production dashboard only (pre-dating migrations), so the staging
-- rebuild had none — uploads failed with an RLS violation (staging QA catch,
-- 2026-08-03). Recreate them with the standard auth_is_admin() gate
-- (enabled-checked, same effective behavior as prod's legacy versions).
--
-- In production this REPLACES the equivalent legacy policies by name.
-- In staging the drops no-op and the creates fill the gap.

begin;

drop policy if exists dam_assets_storage_read on storage.objects;
drop policy if exists dam_assets_storage_upload on storage.objects;
drop policy if exists dam_assets_storage_update on storage.objects;
drop policy if exists dam_assets_storage_delete on storage.objects;

create policy dam_assets_storage_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'dam-assets' and auth_is_admin())
  with check (bucket_id = 'dam-assets' and auth_is_admin());

commit;
