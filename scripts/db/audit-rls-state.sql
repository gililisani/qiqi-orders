-- Audit: what is the ACTUAL RLS state of every public table in production?
--
-- Run in the Supabase SQL editor. Migration files alone can't answer this:
-- tables/policies created via the dashboard don't appear in supabase/migrations.
--
-- Read the result as follows, per row:
--   rls_enabled = false            -> table is READABLE BY ANY authenticated user
--                                     (client sessions included). Data exposure.
--   rls_enabled = true, policies=0 -> table returns ZERO ROWS to clients, with no
--                                     error. Features silently render empty.
--   rls_enabled = true, client_policies=0 but admin policies exist
--                                  -> admin-only table; fine IF no client page
--                                     queries it directly from the browser.
--
-- Tables the client browser queries directly today (must have a client SELECT
-- policy, or be moved behind a service-role API route):
--   company_notes, note_attachments, order_documents, order_history,
--   packing_slips, company_territories, categories, incoterms, payment_terms,
--   highlighted_products
-- None of these have a policy in supabase/migrations/ as of 2026-08-02.

select
  c.relname                                   as table_name,
  c.relrowsecurity                            as rls_enabled,
  c.relforcerowsecurity                       as rls_forced,
  count(p.polname)                            as total_policies,
  count(p.polname) filter (
    where pg_get_expr(p.polqual, p.polrelid) ilike '%auth_company_id%'
       or pg_get_expr(p.polqual, p.polrelid) ilike '%auth.uid%'
  )                                           as client_scoped_policies,
  coalesce(
    string_agg(p.polname, ', ' order by p.polname),
    '(none)'
  )                                           as policy_names
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
group by c.relname, c.relrowsecurity, c.relforcerowsecurity
order by
  -- most dangerous first: RLS off, then RLS on with no policies at all
  c.relrowsecurity asc,
  count(p.polname) asc,
  c.relname;
