-- Add Products.netsuite_name.
--
-- The column is already referenced by lib/netsuite.ts (push-so flow) and
-- the CSV export, but there's no migration that creates it. On a fresh
-- database the order-push path errors with "column 'netsuite_name' does
-- not exist". On the production DB the column has been added manually
-- at some point; this migration makes that explicit and keeps environments
-- in sync.
--
-- The column is optional — when null, the SKU is used as the NS item id.
-- It exists for the case where the NS item name differs from the SKU
-- and the admin wants to override it for the SO line.

ALTER TABLE public."Products"
  ADD COLUMN IF NOT EXISTS netsuite_name TEXT;

COMMENT ON COLUMN public."Products".netsuite_name IS
  'Optional NetSuite item name override. If null, the SKU is used to resolve the NS item.';
