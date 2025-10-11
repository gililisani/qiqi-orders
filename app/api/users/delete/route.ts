import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await request.json();

    // Validate input
    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required field: userId' },
        { status: 400 }
      );
    }

    // Create Supabase admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Step 1: Nullify user_id in orders table (keep orders, remove user reference)
    const { error: ordersError } = await supabaseAdmin
      .from('orders')
      .update({ user_id: null })
      .eq('user_id', userId);

    if (ordersError) {
      console.error('Failed to nullify user_id in orders:', ordersError);
      // Don't throw - continue with deletion even if this fails
    }

    // Step 2: Nullify changed_by_id in order_history (keep history, remove user reference)
    const { error: historyError } = await supabaseAdmin
      .from('order_history')
      .update({ changed_by_id: null })
      .eq('changed_by_id', userId);

    if (historyError) {
      console.error('Failed to nullify changed_by_id in order_history:', historyError);
      // Don't throw - continue with deletion
    }

    // Step 3: Delete from clients table
    const { error: clientError } = await supabaseAdmin
      .from('clients')
      .delete()
      .eq('id', userId);

    if (clientError) {
      console.error('Failed to delete client profile:', clientError);
      throw clientError;
    }

    // Step 4: Delete from Supabase Auth
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authError) {
      console.error('Failed to delete auth user:', authError);
      throw authError;
    }

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete user' },
      { status: 500 }
    );
  }
}

