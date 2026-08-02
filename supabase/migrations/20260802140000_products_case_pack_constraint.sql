-- case_pack is money-critical: order quantity = cases × case_pack. A 0 or
-- NULL makes the order forms fall back to 1 unit per case, silently
-- under-billing every order for that SKU (a 12-pack bills 1/12th).
--
-- ⚠️ RUN THE CHECK QUERY FIRST. If it returns rows, fix each product's real
-- case pack in the admin UI (or by UPDATE) BEFORE applying the constraint —
-- the ALTERs below will (correctly) fail while bad rows exist. Do NOT
-- blanket-set them to 1: for a real multi-pack SKU, 1 is exactly the bug.
--
--   select id, sku, item_name, case_pack
--   from public."Products"
--   where case_pack is null or case_pack <= 0;

ALTER TABLE public."Products"
  ALTER COLUMN case_pack SET NOT NULL;

ALTER TABLE public."Products"
  ADD CONSTRAINT products_case_pack_positive CHECK (case_pack > 0);
