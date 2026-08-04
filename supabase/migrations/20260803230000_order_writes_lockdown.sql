-- Order-writes hardening, part 2 of 2: drop the client write policies.
--
-- ⚠ APPLY ORDER: run this only AFTER the code deploy that ships
-- /api/orders/save (the forms stop writing browser-direct). Running it
-- against the old code breaks order creation for clients. The reverse
-- (new code, this not yet run) is safe — the policies just sit unused.
--
-- What stays: client SELECT on orders/order_items/order_history (the
-- portal's read surface), and the admin ALL policies (admin browser-direct
-- writes — packing-slip flags, admin refs, item reorder — remain, now
-- behind auth_is_admin()'s aal2 requirement).
--
-- What goes:
--   * orders_client_insert / orders_client_update — form saves are
--     server-side now, with server-computed money fields.
--   * orders_client_delete_cancelled — deletion has gone through
--     /api/orders/delete (service role) since the audit; the policy was
--     an unused parallel path.
--   * order_items_client_insert / _update / _delete — items are written
--     by the save functions only.
--   * order_history_client_insert — the last client-side history writer
--     (form save) now logs server-side; the audit flagged arbitrary
--     client history inserts as an audit-trail integrity risk.

begin;

drop policy if exists orders_client_insert on public.orders;
drop policy if exists orders_client_update on public.orders;
drop policy if exists orders_client_delete_cancelled on public.orders;

drop policy if exists order_items_client_insert on public.order_items;
drop policy if exists order_items_client_update on public.order_items;
drop policy if exists order_items_client_delete on public.order_items;

drop policy if exists order_history_client_insert on public.order_history;

commit;
