-- Cross-Subsidiary Fulfillment — Phase 1
--
-- Two structural changes to support the upcoming 3PL move where Qiqi INC
-- orders will be fulfilled from a Qiqi Global location:
--
-- 1. orders.location_id — snapshot the fulfilling location onto each order
--    at creation time. Today the location is resolved through
--    companies.location_id, which means changing a company's location
--    retroactively changes every historical order's apparent location.
--    That violates accounting/tax requirements (NS SOs are immutable in
--    NetSuite; the Hub must preserve the same reference). Snapshotting
--    decouples historical orders from future company moves.
--
-- 2. Locations.subsidiary_id — each location belongs to a subsidiary, so
--    push-SO can detect cross-subsidiary fulfillment by comparing the
--    customer's subsidiary (company.subsidiary_id) with the location's
--    subsidiary. When they differ, push-SO sets per-line `location` in
--    the NetSuite payload so NS auto-populates the inventory subsidiary
--    (mirrors what admin does manually in the NS UI today).
--
-- Backfills are conservative:
--   - orders.location_id copies company.location_id at the time of
--     migration. Reports / push-SO / display read this snapshot from
--     now on instead of joining through company.
--   - Locations.subsidiary_id is derived from the subsidiary of the
--     companies that point at each location. Safe today because each
--     location is used by companies of one subsidiary only. The MIN
--     aggregate picks deterministically if (somehow) a location is
--     shared across subsidiaries — admin should sanity-check after.
--
-- After this migration ships:
--   - Code starts writing location_id on new orders (snapshot)
--   - push-SO reads orders.location_id, falls back to company.location_id
--     for any old order missing a snapshot
--   - Admin will create the new shared 3PL Location with the right
--     subsidiary set, then bulk-reassign companies on cutover day.

------------------------------------------------------------------------
-- 1. orders.location_id
------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public."Locations"(id);

COMMENT ON COLUMN public.orders.location_id IS
  'Snapshot of the fulfilling location at order creation time. Decouples '
  'historical orders from later changes to companies.location_id. Read this '
  'instead of joining through company when displaying or pushing orders.';

CREATE INDEX IF NOT EXISTS orders_location_id_idx
  ON public.orders (location_id);

-- Backfill: copy current company.location_id into every existing order.
UPDATE public.orders o
   SET location_id = c.location_id
  FROM public.companies c
 WHERE o.company_id = c.id
   AND o.location_id IS NULL;

------------------------------------------------------------------------
-- 2. Locations.subsidiary_id
------------------------------------------------------------------------

ALTER TABLE public."Locations"
  ADD COLUMN IF NOT EXISTS subsidiary_id UUID REFERENCES public.subsidiaries(id);

COMMENT ON COLUMN public."Locations".subsidiary_id IS
  'The subsidiary that owns this location. Used by push-SO to detect '
  'cross-subsidiary fulfillment: when the order''s company.subsidiary_id '
  'differs from location.subsidiary_id, push-SO sets per-line location in '
  'the NetSuite SO payload so NS auto-populates the inventory subsidiary.';

CREATE INDEX IF NOT EXISTS locations_subsidiary_id_idx
  ON public."Locations" (subsidiary_id);

-- Backfill: derive from the subsidiary of companies pointing at each location.
-- DISTINCT ON picks one row per location_id (Postgres has no MIN(uuid)).
-- Today each location is single-subsidiary so the pick is correct
-- regardless of which row wins. Admin should sanity-check after the
-- migration applies — see commit body for the verification query.
UPDATE public."Locations" l
   SET subsidiary_id = sub.subsidiary_id
  FROM (
    SELECT DISTINCT ON (location_id) location_id, subsidiary_id
      FROM public.companies
     WHERE location_id IS NOT NULL
       AND subsidiary_id IS NOT NULL
     ORDER BY location_id, subsidiary_id
  ) sub
 WHERE l.id = sub.location_id
   AND l.subsidiary_id IS NULL;
