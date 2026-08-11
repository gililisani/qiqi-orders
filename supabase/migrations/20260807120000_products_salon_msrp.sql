-- Price list v2 (owner spec 2026-08-04/07): the partner price list shows
-- the caller's REGION price only, plus the two columns from the hand-made
-- template the Hub never had: Salon Price and MSRP.
--
-- msrp NULL renders as "Pro use" on the price list — professional-only
-- products have no retail price (exactly how the owner's manual PDF did it).
--
-- APPLY ORDER: BEFORE the code deploy (forms and the price list read/write
-- these columns).

alter table public."Products"
  add column if not exists salon_price numeric,
  add column if not exists msrp numeric;

comment on column public."Products".salon_price is
  'Suggested salon price (USD) — shown on the partner price list.';
comment on column public."Products".msrp is
  'Manufacturer suggested retail price (USD). NULL = professional-use product, rendered as "Pro use" on the price list.';
