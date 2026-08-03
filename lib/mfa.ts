/**
 * Admin MFA (TOTP) — client-side helpers around Supabase's mfa API.
 *
 * Phase 1 (2026-08): enrollment + login challenge + 30-day re-verification,
 * all client-side. Phase 2 (after every admin is enrolled) hardens the same
 * checks server-side (guards + auth_is_admin()) via the JWT's aal/amr claims.
 *
 * Method: TOTP only (Microsoft/Google Authenticator, 1Password, …) — free on
 * Supabase. SMS deliberately excluded (cost + SIM-swap). Passkeys will slot in
 * as an alternative factor once Supabase's WebAuthn support leaves
 * experimental — the checks here don't change.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** NetSuite-style "MFA life": after this many days, the next admin page load
 *  asks for a fresh 6-digit code (just the code — not a full re-login). */
export const MFA_MAX_AGE_DAYS = 30;

export interface MfaStatus {
  /** The verified TOTP factor, if the user has finished enrollment. */
  factorId: string | null;
  /** Session needs a code to reach aal2 (fresh login on an enrolled account,
   *  or an old session from another device). */
  needsChallenge: boolean;
  /** Session is aal2 but the last code entry is older than MFA_MAX_AGE_DAYS. */
  isStale: boolean;
  /** Unix ms of the last TOTP verification on this session, if known. */
  lastVerifiedAt: number | null;
}

export async function getMfaStatus(supabase: SupabaseClient): Promise<MfaStatus> {
  const [{ data: aal }, { data: factors }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  const verified = factors?.totp?.find((f) => f.status === 'verified') ?? null;
  if (!verified) {
    return { factorId: null, needsChallenge: false, isStale: false, lastVerifiedAt: null };
  }

  const needsChallenge =
    aal?.nextLevel === 'aal2' && aal.currentLevel !== aal.nextLevel;

  // amr entries carry unix-second timestamps of each auth method used on
  // this session; the totp entry marks the last time a code was accepted.
  const totpEntry = (aal?.currentAuthenticationMethods ?? [])
    .filter((m) => m.method === 'totp')
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  const lastVerifiedAt = totpEntry ? totpEntry.timestamp * 1000 : null;

  // Missing amr entry on an aal2 session shouldn't happen; treat as fresh so a
  // quirk can't lock every page behind an unpassable prompt (Phase 1 is soft).
  const isStale =
    !needsChallenge && lastVerifiedAt !== null
      ? Date.now() - lastVerifiedAt > MFA_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
      : false;

  return { factorId: verified.id, needsChallenge, isStale, lastVerifiedAt };
}

/** Challenge + verify a 6-digit code against the given factor. Throws with a
 *  readable message on a wrong code. */
export async function verifyMfaCode(
  supabase: SupabaseClient,
  factorId: string,
  code: string
): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    throw new Error(
      /invalid/i.test(error.message)
        ? 'That code is not valid. Check your authenticator app and try again.'
        : error.message
    );
  }
}
