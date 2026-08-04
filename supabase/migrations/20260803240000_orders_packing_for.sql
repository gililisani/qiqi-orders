-- orders.packing_for — Air vs Ocean packing instruction (owner request
-- 2026-08-03: the warehouse packs the two differently).
--
-- Mandatory on every form save from now on (enforced in /api/orders/save);
-- nullable in the schema because historical orders can't be backfilled.
-- The save functions gain the column — CREATE OR REPLACE keeps their
-- grants (service_role-only, from 20260803220000).
--
-- APPLY ORDER: BEFORE the code deploy (the route writes the column), and
-- 20260803220000 must have run first (these bodies replace those).

alter table public.orders
  add column if not exists packing_for text
  check (packing_for in ('Air Shipping', 'Ocean Shipping'));

comment on column public.orders.packing_for is
  'How the warehouse should pack: Air Shipping | Ocean Shipping. Required on form saves since 2026-08; null on older orders.';

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
    company_id, user_id, po_number, status, location_id, packing_for,
    total_value, support_fund_used, credit_earned
  ) VALUES (
    (p_order->>'company_id')::uuid,
    (p_order->>'user_id')::uuid,
    p_order->>'po_number',
    p_order->>'status',
    (p_order->>'location_id')::uuid,
    p_order->>'packing_for',
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
    packing_for = p_order->>'packing_for',
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
