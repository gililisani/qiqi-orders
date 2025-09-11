// lib/auth-utils.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

export async function getServerSupabase() {
  const cookieStore = cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

export async function requireAuth() {
  const supabase = await getServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    throw new Error('Authentication required');
  }
  
  return { user, supabase };
}

export async function requireAdmin() {
  const { user, supabase } = await requireAuth();
  
  const { data: profile, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  
  if (error || !profile || profile.role !== 'Admin') {
    throw new Error('Admin access required');
  }
  
  return { user, profile, supabase };
}

export async function requireClient() {
  const { user, supabase } = await requireAuth();
  
  const { data: profile, error } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .single();
  
  if (error || !profile || profile.role !== 'Client') {
    throw new Error('Client access required');
  }
  
  return { user, profile, supabase };
}
