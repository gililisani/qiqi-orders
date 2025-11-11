import type { NextRequest } from 'next/server';
import { createSupabaseAuth } from './supabase';

export interface AuthUser {
  id: string;
  roles: string[];
  locale?: string | null;
  region?: string | null;
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
