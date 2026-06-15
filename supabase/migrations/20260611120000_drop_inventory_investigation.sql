-- Remove the Inventory Investigation tool completely.
--
-- The feature (UI, API, lib, scripts, tests) was deleted from the codebase; this
-- drops its Supabase tables so nothing is left behind. All of these held only
-- DERIVED / cached data (recomputable worklists, snapshots, trusted points,
-- per-item transaction caches) — no source-of-truth data lives here, so dropping
-- is safe and non-destructive to the business. Idempotent (IF EXISTS).
--
-- NOT touched: shared helpers auth_is_admin() / auth_company_id() (used by other
-- tables' RLS) and everything outside the inv_inv_* namespace.

DROP TABLE IF EXISTS public.inv_inv_trusted_points     CASCADE;
DROP TABLE IF EXISTS public.inv_inv_dated_snapshots     CASCADE;
DROP TABLE IF EXISTS public.inv_inv_opening_snapshots   CASCADE;
DROP TABLE IF EXISTS public.inv_inv_residuals           CASCADE;
DROP TABLE IF EXISTS public.inv_inv_negative_windows    CASCADE;
DROP TABLE IF EXISTS public.inv_inv_worklist            CASCADE;
DROP TABLE IF EXISTS public.inv_inv_worklist_meta       CASCADE;
DROP TABLE IF EXISTS public.inv_inv_plan_markers        CASCADE;
DROP TABLE IF EXISTS public.inv_inv_opening_balances    CASCADE;
DROP TABLE IF EXISTS public.inv_inv_transactions        CASCADE;
DROP TABLE IF EXISTS public.inv_inv_items               CASCADE;
