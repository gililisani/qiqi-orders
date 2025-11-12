import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAuth } from '../../../../../platform/auth';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function createSupabaseAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function countByStatus(client: ReturnType<typeof createSupabaseAdminClient>, status: string) {
  const { count, error } = await client
    .from('dam_job_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', status);
  if (error) {
    throw error;
  }
  return count ?? 0;
}

export async function GET(request: NextRequest) {
  try {
    const auth = createAuth();
    await auth.requireRole(request, 'admin');

    const supabaseAdmin = createSupabaseAdminClient();
    const [pending, processing, failed] = await Promise.all([
      countByStatus(supabaseAdmin, 'pending'),
      countByStatus(supabaseAdmin, 'processing'),
      countByStatus(supabaseAdmin, 'failed'),
    ]);

    return NextResponse.json({
      pending,
      processing,
      failed,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err instanceof NextResponse) return err;
    console.error('Queue metrics failed', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch queue metrics' }, { status: 500 });
  }
}
