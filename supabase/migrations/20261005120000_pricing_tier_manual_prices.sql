-- Pricing tiers + manual line prices (owner 2026-10-05).
--
-- 1. companies.price_tier — which catalog price a company pays, decoupled
--    from its NetSuite class (the class keeps driving accounting). NULL =
--    automatic: Americas/International from the class, exactly as before.
--    First use: Simply Natural (an International distributor in NetSuite)
--    pays Salon prices.
-- 2. order_items.price_override — the line's unit_price was set manually by
--    an admin. The save route keeps it through later client edits and the
--    NetSuite push gate accepts it instead of the catalog price.
--
-- The save functions are re-created with the new item key. Absent key =
-- false (coalesce), so the CURRENTLY deployed code keeps working unchanged.
--
-- APPLY ORDER: run BEFORE deploying the code (the new code reads
-- companies.price_tier and order_items.price_override).

alter table public.companies
  add column if not exists price_tier text;

alter table public.companies
  drop constraint if exists companies_price_tier_check;
alter table public.companies
  add constraint companies_price_tier_check
  check (price_tier is null or price_tier in ('americas', 'international', 'salon', 'msrp'));

comment on column public.companies.price_tier is
  'Pricing tier the company pays: americas | international | salon | msrp. NULL = automatic from the NetSuite class (America* -> americas, else international). Hub-only; NetSuite class unchanged. Resolver: lib/orderPricing.ts.';

alter table public.order_items
  add column if not exists price_override boolean not null default false;

comment on column public.order_items.price_override is
  'true = unit_price was set manually by an admin (kept through client edits; accepted by the NetSuite push gate instead of the catalog price).';

-- Save functions: same bodies as 20260901120000 plus price_override.
-- CREATE OR REPLACE keeps their grants (service_role-only, from 20260803220000).

create or replace function public.order_save_create(
  p_order jsonb,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO public.orders (
    company_id, user_id, po_number, status, location_id, shipment_type,
    total_value, support_fund_used, credit_earned
  ) VALUES (
    (p_order->>'company_id')::uuid,
    (p_order->>'user_id')::uuid,
    p_order->>'po_number',
    p_order->>'status',
    (p_order->>'location_id')::uuid,
    p_order->>'shipment_type',
    (p_order->>'total_value')::numeric,
    (p_order->>'support_fund_used')::numeric,
    (p_order->>'credit_earned')::numeric
  )
  RETURNING id INTO new_id;

  INSERT INTO public.order_items (
    order_id, product_id, quantity, case_qty, unit_price, total_price,
    is_support_fund_item, sort_order, price_override
  )
  SELECT new_id, x.product_id, x.quantity, coalesce(x.case_qty, 0),
         x.unit_price, x.total_price, x.is_support_fund_item, x.sort_order,
         coalesce(x.price_override, false)
  FROM jsonb_to_recordset(p_items) AS x(
    product_id bigint,
    quantity integer,
    case_qty bigint,
    unit_price numeric,
    total_price numeric,
    is_support_fund_item boolean,
    sort_order integer,
    price_override boolean
  );

  RETURN new_id;
END;
$$;

create or replace function public.order_save_update(
  p_order_id uuid,
  p_order jsonb,
  p_items jsonb
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
BEGIN
  UPDATE public.orders SET
    po_number = p_order->>'po_number',
    status = p_order->>'status',
    shipment_type = p_order->>'shipment_type',
    total_value = (p_order->>'total_value')::numeric,
    support_fund_used = (p_order->>'support_fund_used')::numeric,
    credit_earned = (p_order->>'credit_earned')::numeric
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order % not found', p_order_id;
  END IF;

  DELETE FROM public.order_items WHERE order_id = p_order_id;

  INSERT INTO public.order_items (
    order_id, product_id, quantity, case_qty, unit_price, total_price,
    is_support_fund_item, sort_order, price_override
  )
  SELECT p_order_id, x.product_id, x.quantity, coalesce(x.case_qty, 0),
         x.unit_price, x.total_price, x.is_support_fund_item, x.sort_order,
         coalesce(x.price_override, false)
  FROM jsonb_to_recordset(p_items) AS x(
    product_id bigint,
    quantity integer,
    case_qty bigint,
    unit_price numeric,
    total_price numeric,
    is_support_fund_item boolean,
    sort_order integer,
    price_override boolean
  );
END;
$$;
