-- Drop the orphaned highlighted_products table.
--
-- The Highlighted Products feature was deleted 2026-08-05 (superseded by the
-- announcements/news box) — admin page, nav, and carousel all removed in
-- commit a1973f4. The table has had no readers or writers since; this
-- completes the cleanup. Its RLS policy drops with the table.

drop table if exists public.highlighted_products;
