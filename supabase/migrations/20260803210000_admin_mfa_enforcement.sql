-- Admin MFA Phase 2 — server-side enforcement (owner go-ahead 2026-08-03)
--
-- Rule: an admin WITH a verified MFA factor must be on an aal2 session
-- (i.e. passed a code this session). Admins with no factor pass — the
-- mfa_required hold (Phase 1.5) pushes them to enroll, and the moment they
-- enroll this bites. That conditionality is what makes rollout and
-- lost-phone recovery safe: factor reset → no factor → password login works.
--
-- Two layers get the same rule:
--   * API guards (requireAuthenticatedUser) — this migration's
--     user_has_verified_mfa() is the guard's lookup for aal1 sessions.
--   * RLS — auth_is_admin() (used by every admin-full policy) now refuses
--     aal1 sessions of enrolled admins, covering browser-direct queries.
--
-- APPLY ORDER: run BEFORE deploying the code (the guard calls the new
-- function; it fails open with a loud log if missing, but don't rely on it).

-- Guard lookup: does this user have a verified MFA factor? Service-role only.
create or replace function public.user_has_verified_mfa(target uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_catalog'
as $$
  select exists (
    select 1 from auth.mfa_factors
    where user_id = target and status = 'verified'
  );
$$;

revoke all on function public.user_has_verified_mfa(uuid) from public, anon, authenticated;
grant execute on function public.user_has_verified_mfa(uuid) to service_role;

-- RLS: enrolled admins must be aal2. Keeps the original enabled-admin check
-- verbatim (tier-1, 20260514) and ANDs the MFA condition.
create or replace function public.auth_is_admin()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.admins
    where id = auth.uid() and enabled = true
  )
  and (
    not exists (
      select 1 from auth.mfa_factors
      where user_id = auth.uid() and status = 'verified'
    )
    or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
  );
$$;
