-- ============================================================================
-- Tier-2 RLS cleanup (fix plan WP2) — written against VERIFIED production
-- state (pg_policies dump, 2026-08-02; snapshot in supabase/schema-baseline.sql).
--
-- Rules applied:
--   * Policies are OR'd — every superseded permissive policy is dropped BY
--     NAME, or it silently defeats the tighter one.
--   * Every admin gate that skipped `enabled = true` (legacy
--     `EXISTS (admins WHERE id = auth.uid())`) or called the browser-inert
--     `is_admin()` is replaced with `auth_is_admin()`.
--   * Client gates use `auth_company_id()` / `auth_has_permission()` (both
--     enforce clients.enabled = true).
--
-- Client-visible behavior changes (all intended):
--   * Packing slips: clients become READ-ONLY (edit was admin-intent all along).
--   * Order documents: clients see only is_public docs on their company's
--     orders; client upload/update/delete removed (UI never offered them).
--   * Company notes + attachments: clients only see notes flagged
--     visible_to_client (previously RLS exposed internal notes to direct
--     queries, and note-attachment FILES were readable by any logged-in user).
--   * Product/category image buckets: writes become admin-only.
--   * DAM job queue: readable by admins only (was: every authenticated user).
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- order_documents (10 policies → 2)
-- ---------------------------------------------------------------------------
drop policy if exists "Admins can delete order documents" on public.order_documents;
drop policy if exists "Admins can insert order documents" on public.order_documents;
drop policy if exists "Admins can update order documents" on public.order_documents;
drop policy if exists "Admins can view all order documents" on public.order_documents;
drop policy if exists "admin_full_access" on public.order_documents;
drop policy if exists "client_delete_company_documents" on public.order_documents;
drop policy if exists "client_update_company_documents" on public.order_documents;
drop policy if exists "client_upload_company_documents" on public.order_documents;
drop policy if exists "client_view_company_documents" on public.order_documents;
drop policy if exists "Clients can view public documents for their orders" on public.order_documents;

create policy order_documents_admin_all on public.order_documents
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

-- List only PUBLIC docs on own-company orders; the file itself is served by
-- the signed-url API (service role), so no client storage grant is needed.
create policy order_documents_client_select on public.order_documents
  for select to authenticated
  using (
    is_public = true
    and auth_has_permission('orders')
    and exists (
      select 1 from public.orders o
      where o.id = order_documents.order_id
        and o.company_id = auth_company_id()
    )
  );

-- ---------------------------------------------------------------------------
-- packing_slips: client FOR ALL → FOR SELECT (closes audit 1.2 at the DB)
-- ---------------------------------------------------------------------------
drop policy if exists "Admins full access to packing slips" on public.packing_slips;
drop policy if exists "Clients can access their packing slips" on public.packing_slips;

create policy packing_slips_admin_all on public.packing_slips
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

create policy packing_slips_client_select on public.packing_slips
  for select to authenticated
  using (
    auth_has_permission('orders')
    and exists (
      select 1 from public.orders o
      where o.id = packing_slips.order_id
        and o.company_id = auth_company_id()
    )
  );

-- ---------------------------------------------------------------------------
-- order_items: drop the tier-1 leftover that lacks the permission check
-- (it OR-defeated the four permission-aware policies)
-- ---------------------------------------------------------------------------
drop policy if exists "order_items_client_write" on public.order_items;

-- ---------------------------------------------------------------------------
-- order_history (5 policies → 3, client insert constrained)
-- ---------------------------------------------------------------------------
drop policy if exists "Admins can insert order history" on public.order_history;
drop policy if exists "Admins can view all order history" on public.order_history;
drop policy if exists "Clients can insert order history for their company" on public.order_history;
drop policy if exists "Clients can view their company's order history" on public.order_history;
drop policy if exists "Clients can view their own order history" on public.order_history;

create policy order_history_admin_all on public.order_history
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

create policy order_history_client_select on public.order_history
  for select to authenticated
  using (
    auth_has_permission('orders')
    and exists (
      select 1 from public.orders o
      where o.id = order_history.order_id
        and o.company_id = auth_company_id()
    )
  );

-- Clients may append history on own-company orders, but only AS a client —
-- they can no longer forge 'admin'/'system' entries.
create policy order_history_client_insert on public.order_history
  for insert to authenticated
  with check (
    auth_has_permission('orders')
    and changed_by_role = 'client'
    and exists (
      select 1 from public.orders o
      where o.id = order_history.order_id
        and o.company_id = auth_company_id()
    )
  );

-- ---------------------------------------------------------------------------
-- clients: drop the two legacy duplicates (tier-1 pair already covers both)
-- ---------------------------------------------------------------------------
drop policy if exists "Admins can view all clients" on public.clients;
drop policy if exists "Clients can view own data" on public.clients;

-- ---------------------------------------------------------------------------
-- slis (6 policies → 2)
-- ---------------------------------------------------------------------------
drop policy if exists "Admins can create SLIs" on public.slis;
drop policy if exists "Admins can delete SLIs" on public.slis;
drop policy if exists "Admins can manage all SLIs" on public.slis;
drop policy if exists "Admins can update SLIs" on public.slis;
drop policy if exists "Admins can view all SLIs" on public.slis;
drop policy if exists "Clients can view their company SLIs" on public.slis;

create policy slis_admin_all on public.slis
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

create policy slis_client_select on public.slis
  for select to authenticated
  using (
    sli_type = 'order'
    and auth_has_permission('orders')
    and exists (
      select 1 from public.orders o
      where o.id = slis.order_id
        and o.company_id = auth_company_id()
    )
  );

-- ---------------------------------------------------------------------------
-- company_notes / note_attachments: enforce visible_to_client at the DB
-- (UI always filtered it; direct queries did not)
-- ---------------------------------------------------------------------------
drop policy if exists "Admins can manage company notes" on public.company_notes;
drop policy if exists "Clients can view their company notes" on public.company_notes;

create policy company_notes_admin_all on public.company_notes
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

create policy company_notes_client_select on public.company_notes
  for select to authenticated
  using (company_id = auth_company_id() and visible_to_client = true);

drop policy if exists "Admins can manage note attachments" on public.note_attachments;
drop policy if exists "Clients can view their company note attachments" on public.note_attachments;

create policy note_attachments_admin_all on public.note_attachments
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

create policy note_attachments_client_select on public.note_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.company_notes n
      where n.id = note_attachments.note_id
        and n.company_id = auth_company_id()
        and n.visible_to_client = true
    )
  );

-- ---------------------------------------------------------------------------
-- Remaining legacy admin gates (no enabled check) → auth_is_admin()
-- ---------------------------------------------------------------------------
drop policy if exists "Admins can manage admin notes" on public.admin_notes;
create policy admin_notes_admin_all on public.admin_notes
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists "Allow admins to update categories" on public.categories;
create policy categories_admin_all on public.categories
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists "Admins can manage company territories" on public.company_territories;
drop policy if exists "Clients can view their company territories" on public.company_territories;
create policy company_territories_admin_all on public.company_territories
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());
create policy company_territories_client_select on public.company_territories
  for select to authenticated
  using (company_id = auth_company_id());

drop policy if exists "Admins can manage highlighted products" on public.highlighted_products;
create policy highlighted_products_admin_all on public.highlighted_products
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists "Admins can manage historical sales" on public.historical_sales;
create policy historical_sales_admin_all on public.historical_sales
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists "Admins can manage incoterms" on public.incoterms;
create policy incoterms_admin_all on public.incoterms
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists "Admins can manage payment terms" on public.payment_terms;
create policy payment_terms_admin_all on public.payment_terms
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists "Admins can manage target periods" on public.target_periods;
drop policy if exists "Clients can view their company target periods" on public.target_periods;
create policy target_periods_admin_all on public.target_periods
  for all to authenticated
  using (auth_is_admin()) with check (auth_is_admin());
create policy target_periods_client_select on public.target_periods
  for select to authenticated
  using (company_id = auth_company_id());

-- ---------------------------------------------------------------------------
-- DAM: is_admin() is browser-inert (EXECUTE revoked from authenticated) and
-- skips the enabled check — swap all 15 usages for auth_is_admin().
-- Blanket authenticated READS stay: DAM is deliberately open to every
-- partner (owner decision 2026-08-02).
-- ---------------------------------------------------------------------------
drop policy if exists dam_asset_audience_map_admin_full on public.dam_asset_audience_map;
create policy dam_asset_audience_map_admin_all on public.dam_asset_audience_map
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists dam_asset_locale_map_admin_full on public.dam_asset_locale_map;
create policy dam_asset_locale_map_admin_all on public.dam_asset_locale_map
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists dam_asset_region_map_admin_full on public.dam_asset_region_map;
create policy dam_asset_region_map_admin_all on public.dam_asset_region_map
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists dam_asset_renditions_admin_full on public.dam_asset_renditions;
create policy dam_asset_renditions_admin_all on public.dam_asset_renditions
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists dam_asset_subtypes_admin_full on public.dam_asset_subtypes;
create policy dam_asset_subtypes_admin_all on public.dam_asset_subtypes
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists dam_asset_tag_map_admin_full on public.dam_asset_tag_map;
create policy dam_asset_tag_map_admin_all on public.dam_asset_tag_map
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists dam_asset_types_admin_full on public.dam_asset_types;
create policy dam_asset_types_admin_all on public.dam_asset_types
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists dam_asset_versions_admin_full on public.dam_asset_versions;
create policy dam_asset_versions_admin_all on public.dam_asset_versions
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists dam_assets_admin_full on public.dam_assets;
create policy dam_assets_admin_all on public.dam_assets
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists dam_audiences_admin_full on public.dam_audiences;
create policy dam_audiences_admin_all on public.dam_audiences
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists dam_download_events_admin_full on public.dam_download_events;
create policy dam_download_events_admin_all on public.dam_download_events
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

-- Users may log downloads, but only attributed to THEMSELVES.
drop policy if exists dam_download_events_user_insert on public.dam_download_events;
create policy dam_download_events_user_insert on public.dam_download_events
  for insert to authenticated
  with check (downloaded_by = auth.uid());

drop policy if exists dam_job_queue_modify on public.dam_job_queue;
drop policy if exists dam_job_queue_read on public.dam_job_queue;  -- was USING (true)
create policy dam_job_queue_admin_all on public.dam_job_queue
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists dam_locales_admin_full on public.dam_locales;
create policy dam_locales_admin_all on public.dam_locales
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists dam_regions_admin_full on public.dam_regions;
create policy dam_regions_admin_all on public.dam_regions
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

drop policy if exists dam_tags_admin_full on public.dam_tags;
create policy dam_tags_admin_all on public.dam_tags
  for all to authenticated using (auth_is_admin()) with check (auth_is_admin());

-- is_admin() now has zero references (verified: policies above were the only
-- users in the entire schema) — retire it.
drop function if exists public.is_admin();

-- ---------------------------------------------------------------------------
-- STORAGE
-- ---------------------------------------------------------------------------

-- company-notes bucket: was readable by EVERY authenticated user. Scope to
-- admins + own-company clients on client-visible notes (note_attachments.
-- file_path is the object name; NotesView mints signed URLs browser-side).
drop policy if exists "Authenticated users can view company note attachments" on storage.objects;
drop policy if exists "Admins can delete company note attachments" on storage.objects;
drop policy if exists "Admins can update company note attachments" on storage.objects;
drop policy if exists "Admins can upload company note attachments" on storage.objects;

create policy company_notes_storage_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'company-notes' and auth_is_admin())
  with check (bucket_id = 'company-notes' and auth_is_admin());

create policy company_notes_storage_client_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'company-notes'
    and exists (
      select 1
      from public.note_attachments na
      join public.company_notes n on n.id = na.note_id
      where na.file_path = storage.objects.name
        and n.company_id = auth_company_id()
        and n.visible_to_client = true
    )
  );

-- order-documents bucket: admin-only at the storage layer (clients get files
-- through the signed-url API). The old client policy was broken anyway
-- (matched against foldername(clients.name)).
drop policy if exists "Admins can delete order documents" on storage.objects;
drop policy if exists "Admins can upload order documents" on storage.objects;
drop policy if exists "Admins can view order documents" on storage.objects;
drop policy if exists "Clients can view their order documents" on storage.objects;

create policy order_documents_storage_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'order-documents' and auth_is_admin())
  with check (bucket_id = 'order-documents' and auth_is_admin());

-- product-images / category-images: PUBLIC-read buckets, but writes were
-- open to every authenticated user (policy names said "Admin"; the checks
-- didn't). Admin-only now.
drop policy if exists "Allow authenticated users to upload product images" on storage.objects;
create policy product_images_storage_admin_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and auth_is_admin());

drop policy if exists "Admin delete access for category images" on storage.objects;
drop policy if exists "Admin update access for category images" on storage.objects;
drop policy if exists "Admin write access for category images" on storage.objects;
create policy category_images_storage_admin_all on storage.objects
  for all to authenticated
  using (bucket_id = 'category-images' and auth_is_admin())
  with check (bucket_id = 'category-images' and auth_is_admin());

commit;
