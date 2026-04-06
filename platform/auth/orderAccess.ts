import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthUser } from './index';

/**
 * Ensures the authenticated user may access the given order for email/notification APIs.
 * - Admins: any order
 * - Clients: only orders for their company_id
 */
export async function assertOrderAccess(
  supabase: SupabaseClient,
  user: AuthUser,
  orderId: string
): Promise<{ ok: true; order: { company_id: string } } | { ok: false; response: NextResponse }> {
  const { data: order, error } = await supabase
    .from('orders')
    .select('company_id')
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    console.error('[assertOrderAccess] order fetch:', error);
    return { ok: false, response: NextResponse.json({ error: 'Failed to load order' }, { status: 500 }) };
  }
  if (!order) {
    return { ok: false, response: NextResponse.json({ error: 'Order not found' }, { status: 404 }) };
  }

  if (user.roles.includes('admin')) {
    return { ok: true, order };
  }

  if (user.roles.includes('client')) {
    const { data: clientRow, error: clientRowError } = await supabase
      .from('clients')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (clientRowError) {
      console.error('[assertOrderAccess] client fetch:', clientRowError);
      return { ok: false, response: NextResponse.json({ error: 'Failed to authorize' }, { status: 500 }) };
    }
    if (!clientRow || clientRow.company_id !== order.company_id) {
      return { ok: false, response: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
    }
    return { ok: true, order };
  }

  return { ok: false, response: NextResponse.json({ error: 'Access denied' }, { status: 403 }) };
}
