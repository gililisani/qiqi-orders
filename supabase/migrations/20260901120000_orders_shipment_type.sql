-- orders.shipment_type — replaces packing_for (owner doc "Qiqi HUB Ship Hero
-- Configurations", locked 2026-09-01). Six shipment types now drive the
-- ShipHero order construction: tags, shipping carrier/method, and the
-- suffix of the warehouse order number ({NS SO}-{Country}-{code}).
--
-- Codes: SEA | AIR | LTL | STANDARD | DDP | LABELS.
-- Labels/tags live in lib/shipmentTypes.ts — the single source of truth.
-- Legacy values are remapped: 'Air Shipping' -> AIR, 'Ocean Shipping' -> SEA.
--
-- APPLY ORDER: run this immediately BEFORE deploying the code that writes
-- shipment_type (same precedent as 20260803240000 — the save functions read
-- the new jsonb key). In the minutes between SQL and deploy, an order saved
-- by the old code loses its packing value for that save; re-saving fixes it.

alter table public.orders
  drop constraint if exists orders_packing_for_check;

alter table public.orders
  rename column packing_for to shipment_type;

update public.orders set shipment_type = 'AIR' where shipment_type = 'Air Shipping';
update public.orders set shipment_type = 'SEA' where shipment_type = 'Ocean Shipping';

alter table public.orders
  add constraint orders_shipment_type_check
  check (shipment_type in ('SEA', 'AIR', 'LTL', 'STANDARD', 'DDP', 'LABELS'));

comment on column public.orders.shipment_type is
  'Shipment type code (SEA|AIR|LTL|STANDARD|DDP|LABELS) — drives ShipHero tags, carrier/method and the warehouse order-number suffix. Labels in lib/shipmentTypes.ts. Required on form saves; null on pre-2026-08 orders.';

-- Save functions: same bodies as 20260803240000, reading the new key.
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
    is_support_fund_item, sort_order
  )
  SELECT new_id, x.product_id, x.quantity, coalesce(x.case_qty, 0),
         x.unit_price, x.total_price, x.is_support_fund_item, x.sort_order
  FROM jsonb_to_recordset(p_items) AS x(
    product_id bigint,
    quantity integer,
    case_qty bigint,
    unit_price numeric,
    total_price numeric,
    is_support_fund_item boolean,
    sort_order integer
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
    is_support_fund_item, sort_order
  )
  SELECT p_order_id, x.product_id, x.quantity, coalesce(x.case_qty, 0),
         x.unit_price, x.total_price, x.is_support_fund_item, x.sort_order
  FROM jsonb_to_recordset(p_items) AS x(
    product_id bigint,
    quantity integer,
    case_qty bigint,
    unit_price numeric,
    total_price numeric,
    is_support_fund_item boolean,
    sort_order integer
  );
END;
$$;
