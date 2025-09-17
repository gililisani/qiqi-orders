import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { orderId, trackingNumber, notes } = await request.json();

    if (!orderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Update order status to Done and add completion details
    const updateData: any = {
      status: 'Done',
      netsuite_status: 'fulfilled',
      updated_at: new Date().toISOString(),
    };

    // Add tracking number if provided
    if (trackingNumber) {
      updateData.tracking_number = trackingNumber;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', orderId);

    if (updateError) {
      console.error('Error updating order:', updateError);
      return NextResponse.json(
        { error: 'Failed to update order status' },
        { status: 500 }
      );
    }

    // Add completion entry to order history
    const { error: historyError } = await supabase
      .from('order_history')
      .insert([{
        order_id: orderId,
        status_from: order.status,
        status_to: 'Done',
        notes: `Order completed${trackingNumber ? ` - Tracking: ${trackingNumber}` : ''}${notes ? ` - ${notes}` : ''}`,
        changed_by_name: 'System',
        changed_by_role: 'system',
        netsuite_sync_status: 'fulfilled'
      }]);

    if (historyError) {
      console.error('Error adding to order history:', historyError);
    }

    // Send completion notification
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/orders/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: orderId,
          type: 'completion',
          customMessage: trackingNumber ? `Tracking Number: ${trackingNumber}` : undefined
        }),
      });
    } catch (notificationError) {
      console.error('Failed to send completion notification:', notificationError);
      // Don't fail the whole request for notification errors
    }

    return NextResponse.json({
      success: true,
      message: 'Order marked as completed successfully',
      orderId: orderId,
      trackingNumber: trackingNumber || null,
    });

  } catch (error: any) {
    console.error('Order completion error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to complete order' },
      { status: 500 }
    );
  }
}

// GET endpoint to check if an order can be completed
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, status, netsuite_sales_order_id, netsuite_status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Check if order can be completed
    const canComplete = order.status === 'In Process' && order.netsuite_sales_order_id;
    const isAlreadyComplete = order.status === 'Done';

    return NextResponse.json({
      orderId: orderId,
      currentStatus: order.status,
      netsuiteOrderId: order.netsuite_sales_order_id,
      netsuiteStatus: order.netsuite_status,
      canComplete: canComplete,
      isAlreadyComplete: isAlreadyComplete,
      message: canComplete 
        ? 'Order can be completed' 
        : isAlreadyComplete 
          ? 'Order is already completed'
          : 'Order must be in "In Process" status with NetSuite ID to be completed'
    });

  } catch (error: any) {
    console.error('Error checking order completion status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check order status' },
      { status: 500 }
    );
  }
}
