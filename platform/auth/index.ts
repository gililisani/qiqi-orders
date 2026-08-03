import type { NextRequest } from 'next/server';
import { createSupabaseAuth } from './supabase';

export interface AuthUser {
  id: string;
  roles: string[];
  locale?: string | null;
  region?: string | null;
  /** Authenticator assurance level from the validated JWT: 'aal2' after a
   *  successful MFA code this session, 'aal1' otherwise. */
  aal?: string | null;
  /** Auth-method history from the JWT ({method, timestamp-seconds}); the
   *  latest 'totp' entry is when a code was last accepted on this session. */
  amr?: Array<{ method: string; timestamp: number }>;
}

export interface AuthAdapter {
  getUserFromRequest(request: NextRequest): Promise<AuthUser | null>;
  requireRole(request: NextRequest, role: string): Promise<AuthUser>;
}

export function createAuth(): AuthAdapter {
  const provider = (process.env.AUTH_PROVIDER ?? 'supabase').toLowerCase();
  switch (provider) {
    case 'supabase':
      return createSupabaseAuth();
    default:
      throw new Error(`Unsupported AUTH_PROVIDER: ${provider}`);
  }
}
