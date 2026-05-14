-- Fixes for the 5 ERROR-level findings from the Supabase Security Advisor.
--
-- 1. DROP unused SECURITY DEFINER view `contract_summary`.
-- 2-5. Enable RLS on 4 public tables and add policies that match how the
--      app actually queries each one.
--
-- Service-role calls bypass RLS automatically, so server-side API routes
-- using createServiceRoleClient() are unaffected. SECURITY DEFINER RPCs
-- also bypass RLS. These policies only constrain direct client queries
-- made with the user's anon/authenticated JWT.

------------------------------------------------------------------------
-- 1. contract_summary view: unused, created experimentally via Cursor.
------------------------------------------------------------------------
DROP VIEW IF EXISTS public.contract_summary;


------------------------------------------------------------------------
-- 2. note_replies: admin-only feature. Replies exist only on internal
--    (non-client-visible) notes and are an admin-to-admin discussion
--    thread. Clients never see or write replies in today's UI.
------------------------------------------------------------------------
ALTER TABLE public.note_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY note_replies_admin_all
  ON public.note_replies
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.id = (SELECT auth.uid()) AND admins.enabled = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.id = (SELECT auth.uid()) AND admins.enabled = true
  ));


------------------------------------------------------------------------
-- 3. client_note_views: each client manages their own read-status rows.
--    Admins can read all rows (no admin writes happen today).
------------------------------------------------------------------------
ALTER TABLE public.client_note_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_note_views_self_select
  ON public.client_note_views
  FOR SELECT
  TO authenticated
  USING (
    client_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.admins
      WHERE admins.id = (SELECT auth.uid()) AND admins.enabled = true
    )
  );

CREATE POLICY client_note_views_self_insert
  ON public.client_note_views
  FOR INSERT
  TO authenticated
  WITH CHECK (client_id = (SELECT auth.uid()));

CREATE POLICY client_note_views_self_delete
  ON public.client_note_views
  FOR DELETE
  TO authenticated
  USING (client_id = (SELECT auth.uid()));


------------------------------------------------------------------------
-- 4. standalone_slis: admin-only feature; all touch points are admin
--    pages or admin API routes (mostly via service role).
------------------------------------------------------------------------
ALTER TABLE public.standalone_slis ENABLE ROW LEVEL SECURITY;

CREATE POLICY standalone_slis_admin_all
  ON public.standalone_slis
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.id = (SELECT auth.uid()) AND admins.enabled = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.admins
    WHERE admins.id = (SELECT auth.uid()) AND admins.enabled = true
  ));


------------------------------------------------------------------------
-- 5. company_dam_audiences: only accessed by SECURITY DEFINER RPCs and
--    service-role. Enable RLS with no policies = fully locked from
--    direct API access; definer functions and service-role still work.
------------------------------------------------------------------------
ALTER TABLE public.company_dam_audiences ENABLE ROW LEVEL SECURITY;
