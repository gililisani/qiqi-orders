/**
 * Order History Utilities
 *
 * Functions to create order history entries for tracking changes.
 *
 * Failure policy: this function throws on any error (auth missing, profile
 * fetch failed, insert failed). Callers are expected to wrap calls in
 * try/catch and decide whether to surface the failure or just log it —
 * but the audit trail must not be silently dropped.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface AddHistoryEntryParams {
  supabase: SupabaseClient;
  orderId: string;
  actionType: string;
  statusFrom?: string;
  statusTo?: string;
  notes?: string;
  metadata?: any;
  role: 'admin' | 'client';
}

export async function addOrderHistoryEntry(params: AddHistoryEntryParams): Promise<void> {
  const { supabase, orderId, actionType, statusFrom, statusTo, notes, metadata, role } = params;

  const { data: userResult, error: authError } = await supabase.auth.getUser();
  if (authError) {
    throw new Error(`[orderHistory] auth.getUser failed: ${authError.message}`);
  }
  const user = userResult?.user;
  if (!user) {
    throw new Error('[orderHistory] no authenticated user; cannot record audit entry');
  }

  let userName = role === 'admin' ? 'Admin' : 'Client';
  const userRole = role;

  const table = role === 'admin' ? 'admins' : 'clients';
  const { data: profile, error: profileError } = await supabase
    .from(table)
    .select('name')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    // Profile lookup failure is non-fatal — we keep the fallback name and continue.
    console.warn(`[orderHistory] ${table} profile lookup failed for ${user.id}:`, profileError.message);
  } else if (profile?.name) {
    userName = profile.name;
  }

  const { error: insertError } = await supabase
    .from('order_history')
    .insert({
      order_id: orderId,
      action_type: actionType,
      status_from: statusFrom,
      status_to: statusTo,
      notes,
      changed_by_id: user.id,
      changed_by_name: userName,
      changed_by_role: userRole,
      metadata,
    });

  if (insertError) {
    throw new Error(`[orderHistory] insert failed for order ${orderId}: ${insertError.message}`);
  }
}
