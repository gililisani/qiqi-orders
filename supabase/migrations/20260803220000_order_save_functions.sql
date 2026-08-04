-- Order-writes hardening, part 1 of 2: atomic save functions (audit P3
-- follow-through — the last money-path item).
--
-- The order forms wrote orders + order_items browser-direct in up to four
-- statements (insert order → insert items → update totals / update order →
-- delete items → insert items): client-computed money fields, and a
-- half-written order if any step failed. The new /api/orders/save route
-- recomputes every money field server-side (lib/orderSave.ts, same math as
-- lib/orderPricing.ts) and calls these functions for a single-transaction
-- write.
--
-- Part 2 (20260803230000) drops the client write policies — run that one
-- only AFTER the code deploy. THIS file is additive and ships first.

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
    company_id, user_id, po_number, status, location_id,
    total_value, support_fund_used, credit_earned
  ) VALUES (
    (p_order->>'company_id')::uuid,
    (p_order->>'user_id')::uuid,
    p_order->>'po_number',
    p_order->>'status',
    (p_order->>'location_id')::uuid,
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

-- Only the server route (service role) may call these.
revoke all on function public.order_save_create(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.order_save_update(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.order_save_create(jsonb, jsonb) to service_role;
grant execute on function public.order_save_update(uuid, jsonb, jsonb) to service_role;
