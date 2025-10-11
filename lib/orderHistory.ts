/**
 * Order History Utilities
 * 
 * Functions to create order history entries for tracking changes
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

/**
 * Add an entry to the order_history table
 */
export async function addOrderHistoryEntry(params: AddHistoryEntryParams): Promise<void> {
  const { supabase, orderId, actionType, statusFrom, statusTo, notes, metadata, role } = params;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get user profile for name
    let userName = 'Unknown';
    let userRole = 'system';

    if (role === 'admin') {
      const { data: adminProfile } = await supabase
        .from('admins')
        .select('name')
        .eq('id', user.id)
        .single();
      userName = adminProfile?.name || 'Admin';
      userRole = 'admin';
    } else {
      const { data: clientProfile } = await supabase
        .from('clients')
        .select('name')
        .eq('id', user.id)
        .single();
      userName = clientProfile?.name || 'Client';
      userRole = 'client';
    }

    await supabase
      .from('order_history')
      .insert({
        order_id: orderId,
        action_type: actionType,
        status_from: statusFrom,
        status_to: statusTo,
        notes: notes,
        changed_by_id: user.id,
        changed_by_name: userName,
        changed_by_role: userRole,
        metadata: metadata
      });
  } catch (error) {
    console.error('Error adding history entry:', error);
  }
}

