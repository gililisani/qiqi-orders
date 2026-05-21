/**
 * API Route: Set Password via Custom Token
 *
 * POST /api/auth/set-password
 * Body: { token: string, password: string }
 *
 * Validates the token from password_setup_tokens (unused, unexpired),
 * sets the password via Supabase Admin API, marks the token used, and
 * returns a fresh session so the client can auto-login.
 *
 * No browser authentication required — the token IS the credential.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import {
  SET_PASSWORD_PER_TOKEN_RATE,
  enforceRateLimit,
} from '../../../../platform/rateLimit';

const MIN_PASSWORD_LENGTH = 6;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, password } = body as { token?: string; password?: string };

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token.' }, { status: 400 });
    }
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Missing password.' }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
        { status: 400 }
      );
    }

    const supabaseAdmin = createServiceRoleClient();

    // Anti-brute-force: limit attempts per token. 32-byte token is unguessable,
    // but a sloppy implementation could leak guesses, so we still cap.
    const limited = await enforceRateLimit(supabaseAdmin, {
      key: `set-password:token:${token.slice(0, 64)}`,
      limit: SET_PASSWORD_PER_TOKEN_RATE.limit,
      windowSeconds: SET_PASSWORD_PER_TOKEN_RATE.windowSeconds,
    });
    if (!limited.ok) return limited.response;

    // Fetch the token row
    const { data: tokenRow, error: tokenError } = await supabaseAdmin
      .from('password_setup_tokens')
      .select('token, user_id, expires_at, used_at')
      .eq('token', token)
      .maybeSingle();

    if (tokenError) {
      console.error('[set-password] token lookup error:', tokenError);
      return NextResponse.json({ error: 'Failed to validate link.' }, { status: 500 });
    }
    if (!tokenRow) {
      return NextResponse.json(
        { error: 'This password link is invalid. Please ask your administrator to send a new one.' },
        { status: 400 }
      );
    }
    if (tokenRow.used_at) {
      return NextResponse.json(
        { error: 'This password link has already been used. Please ask your administrator to send a new one.' },
        { status: 400 }
      );
    }
    if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'This password link has expired. Please ask your administrator to send a new one.' },
        { status: 400 }
      );
    }

    // Look up the user (we need their email for auto-login)
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      tokenRow.user_id
    );
    if (userError || !userData?.user?.email) {
      console.error('[set-password] user lookup failed:', userError);
      return NextResponse.json({ error: 'User account not found.' }, { status: 500 });
    }
    const email = userData.user.email;

    // Set the password via Admin API
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      tokenRow.user_id,
      { password }
    );
    if (updateError) {
      console.error('[set-password] updateUserById failed:', updateError);
      return NextResponse.json(
        { error: `Failed to set password: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Mark token used so it can never be replayed
    await supabaseAdmin
      .from('password_setup_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token);

    // Auto-login: sign in with the password we just set, return session tokens.
    // We use a non-service-role client because signInWithPassword is a "user"-
    // facing operation that must respect the normal auth flow.
    const supabasePublic = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: signInData, error: signInError } = await supabasePublic.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData?.session) {
      // Password is set, but auto-login failed. Don't fail the whole call —
      // tell the client to go to the login page manually.
      console.error('[set-password] auto-login failed:', signInError);
      return NextResponse.json({
        success: true,
        autoLogin: false,
        message: 'Password set successfully. Please log in.',
      });
    }

    return NextResponse.json({
      success: true,
      autoLogin: true,
      session: {
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      },
    });
  } catch (error: any) {
    console.error('[set-password] error:', error);
    return NextResponse.json(
      { error: error.message || 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
