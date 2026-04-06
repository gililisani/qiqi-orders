import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createAuth, type AuthUser } from './index';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function createServiceRoleClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Prefer: 'return=minimal',
      },
    },
  });
}

export async function requireAuthenticatedUser(request: NextRequest): Promise<AuthUser> {
  const auth = createAuth();
  const user = await auth.getUserFromRequest(request);
  if (!user) {
    throw NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return user;
}

export async function requireAnyRole(request: NextRequest, roles: Array<'admin' | 'client'>): Promise<AuthUser> {
  const user = await requireAuthenticatedUser(request);
  const ok = roles.some((r) => user.roles.includes(r));
  if (!ok) {
    throw NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }
  return user;
}

export async function requireAdmin(request: NextRequest): Promise<AuthUser> {
  return requireAnyRole(request, ['admin']);
}

export async function requireClient(request: NextRequest): Promise<AuthUser> {
  return requireAnyRole(request, ['client']);
}

