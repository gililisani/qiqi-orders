-- User permissions system — light, stackable, area-scoped.
--
-- Adds a `permissions TEXT[]` column to both admins and clients. Each value
-- is an atomic permission string (e.g. 'dam', 'orders', 'reports',
-- 'users:manage'). Code asks "does this user have permission X?" via a
-- centralized helper; RLS asks the same question via auth_has_permission().
--
-- The vocabulary lives in lib/permissions.ts. The DB stores whatever array
-- the app writes — no enum, no FK to a permissions catalog — so new
-- permissions can be added without a migration.
--
-- Backfill matches today's behavior exactly:
--   - Every existing admin gets the full permission set (no admin loses access)
--   - Every existing client gets ['orders', 'dam'] (full client access today)
--
-- RLS tightening (this migration):
--   - Client RLS on orders + order_items now requires auth_has_permission('orders')
--   - DAM access flows through the SECURITY DEFINER function
--     list_client_dam_assets_entitled() called by service-role API routes,
--     so it's gated at the route guard layer (lib/permissions.ts), not RLS.
--
-- Admin RLS is intentionally NOT tightened in this migration. Today every
-- admin has all permissions, so the gate would never trip. Granular admin
-- permission enforcement (e.g. an admin without 'admins:manage' cannot
-- edit other admins) happens at the route guard layer for v1. RLS tightening
-- for admins can be added per-table as the need arises.

------------------------------------------------------------------------
-- 1. Schema: permissions arrays
------------------------------------------------------------------------

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

COMMENT ON COLUMN public.admins.permissions IS
  'Atomic, area-scoped permission strings (e.g. dam, orders, admins:manage). '
  'See lib/permissions.ts for the canonical vocabulary. Empty array = no access. '
  'Empty by default; backfilled to ALL permissions for existing rows below.';

COMMENT ON COLUMN public.clients.permissions IS
  'Atomic, area-scoped permission strings. See lib/permissions.ts. '
  'Empty by default; backfilled to [orders, dam] for existing rows below. '
  'A DAM-only external user has [dam]; a typical client has [orders, dam].';

------------------------------------------------------------------------
-- 2. Backfill — preserve existing behavior exactly
------------------------------------------------------------------------

-- Admins: full permission set. The list mirrors lib/permissions.ts ALL_PERMISSIONS.
-- If lib/permissions.ts grows, update existing admins via a follow-up SQL or admin UI.
UPDATE public.admins
   SET permissions = ARRAY[
     'dam',
     'orders',
     'reports',
     'users:manage',
     'admins:manage',
     'companies:manage',
     'netsuite',
     'settings'
   ]
 WHERE permissions = ARRAY[]::TEXT[];

-- Clients: orders + dam (current default; matches today's full client access)
UPDATE public.clients
   SET permissions = ARRAY['orders', 'dam']
 WHERE permissions = ARRAY[]::TEXT[];

------------------------------------------------------------------------
-- 3. auth_has_permission() — RLS helper
--
-- SECURITY DEFINER so policies can call it without recursing back through
-- the admin/client RLS gates. Reads the permission from whichever table
-- holds the caller (admins.permissions OR clients.permissions).
------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auth_has_permission(p_perm TEXT)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
     WHERE id = auth.uid()
       AND enabled = true
       AND p_perm = ANY(permissions)
  )
  OR EXISTS (
    SELECT 1 FROM public.clients
     WHERE id = auth.uid()
       AND enabled = true
       AND p_perm = ANY(permissions)
  );
$$;

COMMENT ON FUNCTION public.auth_has_permission(TEXT) IS
  'Returns true if the calling auth.uid() has the named permission in '
  'either admins.permissions or clients.permissions. Used in RLS policies '
  'and via callable from the application (granted to authenticated).';

REVOKE EXECUTE ON FUNCTION public.auth_has_permission(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.auth_has_permission(TEXT) TO authenticated, service_role;

------------------------------------------------------------------------
-- 4. Tighten client RLS on orders + order_items with the 'orders' gate
--
-- Same shape as before; AND-ed with the new permission check. Admin
-- policies untouched (admins always have all permissions today).
------------------------------------------------------------------------

DROP POLICY IF EXISTS orders_client_select ON public.orders;
CREATE POLICY orders_client_select
  ON public.orders FOR SELECT TO authenticated
  USING (
    company_id = public.auth_company_id()
    AND public.auth_has_permission('orders')
  );

DROP POLICY IF EXISTS orders_client_insert ON public.orders;
CREATE POLICY orders_client_insert
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.auth_company_id()
    AND status IN ('Draft', 'Open')
    AND public.auth_has_permission('orders')
  );

DROP POLICY IF EXISTS orders_client_update ON public.orders;
CREATE POLICY orders_client_update
  ON public.orders FOR UPDATE TO authenticated
  USING (
    company_id = public.auth_company_id()
    AND status IN ('Draft', 'Open')
    AND public.auth_has_permission('orders')
  )
  WITH CHECK (
    company_id = public.auth_company_id()
    AND status IN ('Draft', 'Open')
    AND public.auth_has_permission('orders')
  );

DROP POLICY IF EXISTS orders_client_delete_draft ON public.orders;
CREATE POLICY orders_client_delete_draft
  ON public.orders FOR DELETE TO authenticated
  USING (
    company_id = public.auth_company_id()
    AND status = 'Draft'
    AND public.auth_has_permission('orders')
  );

------------------------------------------------------------------------
-- order_items — same pattern, AND'd with the 'orders' gate via the
-- parent order's company_id check.
------------------------------------------------------------------------

DROP POLICY IF EXISTS order_items_client_select ON public.order_items;
CREATE POLICY order_items_client_select
  ON public.order_items FOR SELECT TO authenticated
  USING (
    public.auth_has_permission('orders')
    AND EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_items.order_id
         AND o.company_id = public.auth_company_id()
    )
  );

DROP POLICY IF EXISTS order_items_client_insert ON public.order_items;
CREATE POLICY order_items_client_insert
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (
    public.auth_has_permission('orders')
    AND EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_items.order_id
         AND o.company_id = public.auth_company_id()
         AND o.status IN ('Draft', 'Open')
    )
  );

DROP POLICY IF EXISTS order_items_client_update ON public.order_items;
CREATE POLICY order_items_client_update
  ON public.order_items FOR UPDATE TO authenticated
  USING (
    public.auth_has_permission('orders')
    AND EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_items.order_id
         AND o.company_id = public.auth_company_id()
         AND o.status IN ('Draft', 'Open')
    )
  )
  WITH CHECK (
    public.auth_has_permission('orders')
    AND EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_items.order_id
         AND o.company_id = public.auth_company_id()
         AND o.status IN ('Draft', 'Open')
    )
  );

DROP POLICY IF EXISTS order_items_client_delete ON public.order_items;
CREATE POLICY order_items_client_delete
  ON public.order_items FOR DELETE TO authenticated
  USING (
    public.auth_has_permission('orders')
    AND EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.id = order_items.order_id
         AND o.company_id = public.auth_company_id()
         AND o.status IN ('Draft', 'Open')
    )
  );
