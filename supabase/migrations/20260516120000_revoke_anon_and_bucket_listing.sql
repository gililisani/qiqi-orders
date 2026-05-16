-- Round B + bucket cleanup.
--
-- 1) Revoke all DML privileges on every public-schema table from the
--    `anon` role. The app's only anonymous flow is auth (sign-in /
--    password reset), which uses Supabase Auth endpoints, not table
--    queries. Removing these grants both:
--      - hides the tables from the auto-generated GraphQL schema for
--        unauthenticated callers (clears ~32 advisor warnings), and
--      - blocks anonymous SELECT/INSERT/UPDATE/DELETE on every table.
--
-- 2) Drop the two broad SELECT policies on storage.objects that let
--    anyone LIST files in the `category-images` and `product-images`
--    buckets. The buckets themselves are public, so direct object URLs
--    (the only access pattern the app uses) keep working — only the
--    enumerate-all-files capability is removed.

------------------------------------------------------------------------
-- 1. Revoke anon DML on public tables.
------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Also revoke any future default privileges so newly-created tables
-- don't silently re-grant anon access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;


------------------------------------------------------------------------
-- 2. Drop the broad SELECT policies on storage.objects that allow
--    listing files in the two public image buckets.
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read access for category images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public access to product images" ON storage.objects;
