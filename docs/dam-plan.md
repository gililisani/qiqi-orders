# Qiqi Partners Hub – DAM Module Plan

## Goals
- Embed a Supabase-backed digital asset manager inside the Partners Hub.
- Reuse existing Supabase authentication; all assets require authorization (private storage + signed URLs).
- Support marketing/product collateral workflows: upload, metadata, search, download, versioning.

## Architecture Overview
- **Storage:** Supabase Storage bucket `dam-assets` (private). Upload via Supabase SDK.
- **Database:** Supabase Postgres tables for assets, versions, tags, audiences, locales, optional regions, and permissions. Store search metadata in a materialized search vector/text column.
- **Background Processing:** Supabase Edge Functions invoked by storage triggers to create thumbnails, PDF previews, and extract PDF text for search indexing.
- **Access Control:** Row-level security tied to existing user roles. Signed URLs (5–30 min) for downloads.

## Implementation Steps
1. **schema-setup**  
   - SQL migrations for tables: `asset`, `asset_version`, `asset_tag`, `asset_audience`, `asset_locale`, `asset_region` (region optional), join tables (`asset_asset_tag`, etc.).
   - Enums: asset type, audience, release status, etc. Foreign key to existing `companies`/`products` where needed (SKU/product line references).
   - Configure bucket `dam-assets` as private. Define RLS policies for admin vs distributor access.

2. **ingestion-services**  
   - Supabase Edge Function `dam-upload` accepts upload metadata, writes storage object, inserts DB rows, returns asset + signed URL.  
   - Storage trigger (Edge Function/cron) to: 
     - generate thumbnails (images/videos) and PDF previews.
     - extract PDF text and store in `asset_version.search_vector`.  
   - Mark newest version as current; record dimensions, duration, file size, checksum.

3. **admin-ui**  
   - Admin dashboard: drag/drop uploader, metadata form (title, description, SKU, product line, tags, audience, locale, optional region).  
   - Version history management (restore, download).  
   - Tag/audience management utilities.

4. **browse-ui**  
   - Distributor/pro view with filters: asset type, product line, SKU, tags, language locale, optional territory region.  
   - Grid/list toggle, infinite scroll.  
   - Detail modal with preview, metadata, versions, download button (signed URL).  
   - Optional bulk download queue stub (emails signed bundle link).

5. **testing-docs**  
   - Validate RLS, signed URL expiry, search indexing, thumbnail generation.  
   - Document admin workflow, troubleshooting, and Supabase environment setup.

## Notes
- Build against Supabase staging first; production migrations/deployments only after approval.  
- Locale is required metadata; region selection optional.
