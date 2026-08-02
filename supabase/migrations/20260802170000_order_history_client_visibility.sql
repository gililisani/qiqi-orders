-- order_history: per-row client visibility (owner decision 2026-08-02)
--
-- After the tier-2 cleanup (20260802150000) clients see every order_history
-- row for their company's orders — including internal notes ("NetSuite Sales
-- Order created: SO123", "Sent for payment — Stripe invoice N ($X) incl. Z%
-- card fee", ShipHero pushes, shipping-fee edits, notification logs).
-- An action_type whitelist can't fix this: internal writers reuse
-- 'status_change' / 'order_updated'. So visibility is a per-row flag.
--
-- Convention:
--   * DB default FALSE — a write site must opt IN to client visibility.
--     Internal service-role writers (NetSuite / Stripe / ShipHero / shipping /
--     notifications) don't set the column and stay hidden.
--   * Client-appropriate writers set visible_to_client = true explicitly:
--     lib/orderHistory.ts (UI order create/update/status/packing slip),
--     document upload/delete components, and /api/orders/complete
--     (Done + tracking number).
--
-- APPLY ORDER (exception to the usual push-first rule): run this SQL BEFORE
-- deploying the code. Old code inserting without the column is fine; new code
-- inserting the column into the old schema fails (PGRST204).

alter table public.order_history
  add column if not exists visible_to_client boolean not null default false;

comment on column public.order_history.visible_to_client is
  'Client portal timeline shows only rows where true. Internal entries (NetSuite/Stripe/ShipHero/shipping/notifications) stay false. Enforced by RLS policy order_history_client_select; write sites opt in explicitly.';

-- One-time backfill. The name heuristic is safe on current data: every
-- internal server-side writer stamps changed_by_name = 'System', while UI
-- writers stamp the acting user's profile name (fallback 'Admin'/'Client').
-- Ongoing writes rely on the explicit column, never on this pattern.
update public.order_history
set visible_to_client = true
where changed_by_role = 'client'
   or action_type in ('order_created', 'document_uploaded', 'document_deleted', 'packing_slip_created')
   or (action_type in ('status_change', 'order_updated')
       and coalesce(changed_by_name, '') <> 'System')
   -- /api/orders/complete rows: System-authored but client-facing (tracking
   -- number). Likely zero rows exist — that insert has been failing on the
   -- phantom netsuite_sync_status column — but cover any that do.
   or notes like 'Order completed%';

-- Same policy as 20260802150000 plus the visibility gate. Admins are
-- unaffected: order_history_admin_all still grants them every row.
drop policy if exists order_history_client_select on public.order_history;

create policy order_history_client_select on public.order_history
  for select to authenticated
  using (
    auth_has_permission('orders')
    and visible_to_client
    and exists (
      select 1 from public.orders o
      where o.id = order_history.order_id
        and o.company_id = auth_company_id()
    )
  );

-- The client INSERT policy is deliberately unchanged: forcing
-- visible_to_client = true there would reject inserts from not-yet-redeployed
-- browser code, and a client hiding their own entry harms nobody (admins see
-- every row regardless).
