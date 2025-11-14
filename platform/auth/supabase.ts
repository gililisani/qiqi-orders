import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { AuthAdapter, AuthUser } from './index';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Supabase auth driver requires SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY');
}

function extractToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (header) {
    const match = header.match(/^Bearer\s+(.*)$/i);
    if (match) return match[1];
  }
  const cookieToken = request.cookies.get('sb-access-token');
  return cookieToken?.value ?? null;
}

function createSupabaseAnonClient(token: string) {
  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

function createSupabaseServiceClient() {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function resolveRoles(userId: string): Promise<{ roles: string[]; locale: string | null; region: string | null }> {
  const supabase = createSupabaseServiceClient();
  
  // Check if user is an admin
  const { data: adminData, error: adminError } = await supabase
    .from('admins')
    .select('enabled')
    .eq('id', userId)
    .maybeSingle();

  // Check if user is a client
  const { data: clientData, error: clientError } = await supabase
    .from('clients')
    .select('enabled')
    .eq('id', userId)
    .maybeSingle();

  if (adminError && clientError) {
    // If both queries error, throw the admin error (more likely to be a real error)
    throw adminError;
  }

  const roles: string[] = [];
  if (adminData?.enabled) roles.push('admin');
  if (clientData?.enabled) roles.push('client');
  
  return {
    roles,
    locale: null,
    region: null,
  };
}

export function createSupabaseAuth(): AuthAdapter {
  return {
    async getUserFromRequest(request: NextRequest): Promise<AuthUser | null> {
      const token = extractToken(request);
      if (!token) return null;

      const supabaseAnon = createSupabaseAnonClient(token);
      const {
        data: { user },
        error,
      } = await supabaseAnon.auth.getUser();

      if (error || !user) {
        return null;
      }

      const { roles, locale, region } = await resolveRoles(user.id);

      return {
        id: user.id,
        roles,
        locale,
        region,
      };
    },

    async requireRole(request: NextRequest, role: string): Promise<AuthUser> {
      const user = await this.getUserFromRequest(request);
      if (!user || !user.roles.includes(role)) {
        throw NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
      return user;
    },
  };
}
