-- Tighten client order DELETE to status='Cancelled' only.
--
-- Previously clients could delete their own Draft orders (the Tier 1
-- RLS overhaul allowed Draft). The new product rule is:
--   - Edits allowed only in Draft / Open
--   - Deletes allowed only in Cancelled
--
-- So Drafts have to be Cancelled first, then Deleted. Cleaner lifecycle,
-- clearer audit trail. Applies to both client and admin paths — the
-- delete API route enforces the same rule for admins (it uses service-role
-- so RLS is bypassed there).

DROP POLICY IF EXISTS orders_client_delete_draft ON public.orders;

CREATE POLICY orders_client_delete_cancelled
  ON public.orders FOR DELETE TO authenticated
  USING (
    company_id = public.auth_company_id()
    AND status = 'Cancelled'
    AND public.auth_has_permission('orders')
  );
