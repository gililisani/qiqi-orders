-- Tier 0 security fix: revoke EXECUTE on SECURITY DEFINER functions from
-- anon and authenticated. These functions are only ever called from
-- server-side API routes using the service_role key, so locking them
-- down at the role level doesn't break any user-facing flow.
--
-- Without this, anyone (including unauthenticated) can call these RPCs
-- via /rest/v1/rpc/<name>. Most critically, delete_user_cascade lets
-- an anonymous request delete any user's database records.

REVOKE EXECUTE ON FUNCTION public.delete_user_cascade(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_client_profile(uuid, text, text, uuid, boolean)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_admin()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.list_client_dam_assets_entitled(
  uuid, text, text, uuid, uuid, text, text, text, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;

-- Ensure service_role still has EXECUTE (idempotent if already granted).
GRANT EXECUTE ON FUNCTION public.delete_user_cascade(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_client_profile(uuid, text, text, uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.list_client_dam_assets_entitled(
  uuid, text, text, uuid, uuid, text, text, text, text, text, integer, integer
) TO service_role;
