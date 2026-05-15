-- Tier 1 RLS overhaul.
--
-- Replaces "USING (true) WITH CHECK (true)" policies on 10 core tables
-- with role-appropriate policies:
--   - admin (id in admins.enabled=true): full CRUD on every table.
--   - authenticated client: scoped access per table.
--
-- The previous always-true policies + GraphQL exposure to `authenticated`
-- meant any signed-in user could read/modify every order, customer,
-- and lookup row. This migration closes that gap.
--
-- Server-side API routes use service_role and continue to bypass RLS.

------------------------------------------------------------------------
-- 0. Helper functions (SECURITY DEFINER so they bypass RLS internally
--    and avoid recursion when policies reference admins/clients).
------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
    WHERE id = auth.uid() AND enabled = true
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_company_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT company_id FROM public.clients
  WHERE id = auth.uid() AND enabled = true
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.auth_is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_company_id() TO authenticated, service_role;


------------------------------------------------------------------------
-- 1. admin_public_profiles view: exposes only (id, name) of admins to
--    authenticated callers so order/document views can show "Created by
--    [admin name]" without leaking emails. `security_invoker = false`
--    means the view runs with its owner's privileges, bypassing RLS on
--    the underlying admins table for callers who only have SELECT on
--    the view.
------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.admin_public_profiles
WITH (security_invoker = false)
AS
SELECT id, name FROM public.admins;

REVOKE ALL ON public.admin_public_profiles FROM PUBLIC, anon;
GRANT SELECT ON public.admin_public_profiles TO authenticated, service_role;


------------------------------------------------------------------------
-- 2. admins: admin-only; clients use admin_public_profiles for names.
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for admins" ON public.admins;
DROP POLICY IF EXISTS "admins_allow_all" ON public.admins;

CREATE POLICY admins_admin_all
  ON public.admins FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());


------------------------------------------------------------------------
-- 3. clients: admin full CRUD; clients see same-company rows.
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for admins" ON public.clients;
DROP POLICY IF EXISTS "clients_allow_all" ON public.clients;

CREATE POLICY clients_admin_all
  ON public.clients FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY clients_self_or_same_company_select
  ON public.clients FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR company_id = public.auth_company_id()
  );


------------------------------------------------------------------------
-- 4. companies: admin full CRUD; clients see only own company.
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for admins" ON public.companies;
DROP POLICY IF EXISTS "companies_allow_all" ON public.companies;

CREATE POLICY companies_admin_all
  ON public.companies FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY companies_client_select_own
  ON public.companies FOR SELECT TO authenticated
  USING (id = public.auth_company_id());


------------------------------------------------------------------------
-- 5. orders:
--    - Admin: full CRUD.
--    - Client SELECT: own company, any status.
--    - Client INSERT: own company, status must be Draft or Open.
--    - Client UPDATE: own company AND status must be Draft or Open
--      (both BEFORE and AFTER the update, so a client can promote
--      Draft -> Open but cannot push an order past Open).
--    - Client DELETE: own company AND status = 'Draft'.
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for admins" ON public.orders;
DROP POLICY IF EXISTS "orders_allow_all" ON public.orders;

CREATE POLICY orders_admin_all
  ON public.orders FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY orders_client_select
  ON public.orders FOR SELECT TO authenticated
  USING (company_id = public.auth_company_id());

CREATE POLICY orders_client_insert
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.auth_company_id()
    AND status IN ('Draft', 'Open')
  );

CREATE POLICY orders_client_update
  ON public.orders FOR UPDATE TO authenticated
  USING (
    company_id = public.auth_company_id()
    AND status IN ('Draft', 'Open')
  )
  WITH CHECK (
    company_id = public.auth_company_id()
    AND status IN ('Draft', 'Open')
  );

CREATE POLICY orders_client_delete_draft
  ON public.orders FOR DELETE TO authenticated
  USING (
    company_id = public.auth_company_id()
    AND status = 'Draft'
  );


------------------------------------------------------------------------
-- 6. order_items: gated by the parent order's company + status.
--    - Admin: full CRUD.
--    - Client: full CRUD when parent order is in own company AND
--      status is Draft or Open. (Cascade DELETE from draft orders
--      relies on this allowing item-row deletion.)
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for admins" ON public.order_items;
DROP POLICY IF EXISTS "order_items_allow_all" ON public.order_items;

CREATE POLICY order_items_admin_all
  ON public.order_items FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY order_items_client_select
  ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.company_id = public.auth_company_id()
  ));

CREATE POLICY order_items_client_write
  ON public.order_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.company_id = public.auth_company_id()
      AND o.status IN ('Draft', 'Open')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.company_id = public.auth_company_id()
      AND o.status IN ('Draft', 'Open')
  ));


------------------------------------------------------------------------
-- 7. Products: admin CRUD; any authenticated user can browse the
--    catalog. No per-company scoping (products are global).
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for admins" ON public."Products";
DROP POLICY IF EXISTS "products_allow_all" ON public."Products";

CREATE POLICY products_admin_all
  ON public."Products" FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY products_authenticated_select
  ON public."Products" FOR SELECT TO authenticated
  USING (true);


------------------------------------------------------------------------
-- 8. Locations: admin CRUD; client sees only the location their
--    company is linked to (companies.location_id).
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for admins" ON public."Locations";

CREATE POLICY locations_admin_all
  ON public."Locations" FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY locations_client_select_own
  ON public."Locations" FOR SELECT TO authenticated
  USING (id = (
    SELECT location_id FROM public.companies
    WHERE id = public.auth_company_id()
  ));


------------------------------------------------------------------------
-- 9. classes: admin CRUD; client sees only their company's class.
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for admins" ON public.classes;

CREATE POLICY classes_admin_all
  ON public.classes FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY classes_client_select_own
  ON public.classes FOR SELECT TO authenticated
  USING (id = (
    SELECT class_id FROM public.companies
    WHERE id = public.auth_company_id()
  ));


------------------------------------------------------------------------
-- 10. subsidiaries: admin CRUD; client sees only their company's.
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for admins" ON public.subsidiaries;

CREATE POLICY subsidiaries_admin_all
  ON public.subsidiaries FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY subsidiaries_client_select_own
  ON public.subsidiaries FOR SELECT TO authenticated
  USING (id = (
    SELECT subsidiary_id FROM public.companies
    WHERE id = public.auth_company_id()
  ));


------------------------------------------------------------------------
-- 11. support_fund_levels: admin CRUD; client sees only theirs.
------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable all operations for admins" ON public.support_fund_levels;

CREATE POLICY support_fund_levels_admin_all
  ON public.support_fund_levels FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY support_fund_levels_client_select_own
  ON public.support_fund_levels FOR SELECT TO authenticated
  USING (id = (
    SELECT support_fund_id FROM public.companies
    WHERE id = public.auth_company_id()
  ));
