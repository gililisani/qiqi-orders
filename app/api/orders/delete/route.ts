/**
 * API Route: Delete Order
 * 
 * DELETE /api/orders/delete
 * 
 * Deletes an order and all related records (items, documents, history).
 * Only allowed for Cancelled or Draft orders.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client with service role
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const userRole = searchParams.get('userRole');

    // Validate input
    if (!orderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch order to check status
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('status')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Only allow deletion of Cancelled or Draft orders
    if (order.status !== 'Cancelled' && order.status !== 'Draft') {
      return NextResponse.json(
        { error: `Cannot delete order with status "${order.status}". Only Cancelled or Draft orders can be deleted.` },
        { status: 403 }
      );
    }

    // Delete related records in order (to avoid foreign key constraints)
    
    // 1. Delete order history
    await supabase
      .from('order_history')
      .delete()
      .eq('order_id', orderId);

    // 2. Delete order documents
    await supabase
      .from('order_documents')
      .delete()
      .eq('order_id', orderId);

    // 3. Delete order items
    await supabase
      .from('order_items')
      .delete()
      .eq('order_id', orderId);

    // 4. Finally, delete the order itself
    const { error: deleteError } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId);

    if (deleteError) {
      console.error('Error deleting order:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete order', details: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Order deleted successfully',
    });
  } catch (error: any) {
    console.error('Error in delete order API:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete order' },
      { status: 500 }
    );
  }
}

