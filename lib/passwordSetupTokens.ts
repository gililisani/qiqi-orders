/**
 * Helper for creating password-setup / password-reset links.
 *
 * All routes that send a setup/reset email MUST go through this helper.
 * It creates a token in our own password_setup_tokens table and returns
 * a URL pointing to /set-password on our domain — NOT a Supabase magic
 * link that gets pre-consumed by email scanners (Defender Safe Links,
 * Mimecast, etc.).
 */

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const PASSWORD_SETUP_TOKEN_TTL_HOURS = 24;

export interface CreatedPasswordSetupLink {
  token: string;
  url: string;
  expiresAt: string;
}

export async function createPasswordSetupLink(
  supabaseAdmin: SupabaseClient,
  params: { userId: string; createdBy?: string | null }
): Promise<CreatedPasswordSetupLink> {
  // Invalidate any previous unused tokens for this user. Only the freshest
  // link should work — old emails sitting in the inbox become inert the
  // moment a new setup link is issued.
  await supabaseAdmin
    .from('password_setup_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', params.userId)
    .is('used_at', null);

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAtDate = new Date(Date.now() + PASSWORD_SETUP_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  const expiresAt = expiresAtDate.toISOString();

  const { error } = await supabaseAdmin
    .from('password_setup_tokens')
    .insert({
      token,
      user_id: params.userId,
      expires_at: expiresAt,
      created_by: params.createdBy ?? null,
    });

  if (error) {
    throw new Error(`Failed to create password setup token: ${error.message}`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  return {
    token,
    url: `${siteUrl}/set-password?token=${token}`,
    expiresAt,
  };
}

/**
 * Best-effort cleanup helper for failed flows (e.g. email send fails after
 * token is created). Deletes the token so a failed email can't be redeemed.
 */
export async function deletePasswordSetupToken(
  supabaseAdmin: SupabaseClient,
  token: string
): Promise<void> {
  await supabaseAdmin.from('password_setup_tokens').delete().eq('token', token);
}
