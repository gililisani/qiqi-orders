import { NextRequest, NextResponse } from 'next/server';
import { createNetSuiteAPI, NetSuiteSalesOrder } from '../../../../lib/netsuite';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { orderId } = await request.json();

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

    // Get order details from Supabase
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        company:companies(
          netsuite_number,
          netsuite_customer_id,
          subsidiary:subsidiaries(netsuite_id),
          location:Locations(netsuite_id)
        ),
        order_items:order_items(
          *,
          product:Products(
            netsuite_id,
            netsuite_itemid,
            item_name
          )
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Check if order already has NetSuite ID
    if (order.netsuite_sales_order_id) {
      return NextResponse.json(
        { error: 'Order already exists in NetSuite' },
        { status: 400 }
      );
    }

    // Initialize NetSuite API
    const netsuite = createNetSuiteAPI();
    
    // Test connection
    const isConnected = await netsuite.testConnection();
    if (!isConnected) {
      return NextResponse.json(
        { error: 'Failed to connect to NetSuite' },
        { status: 500 }
      );
    }

    // Prepare NetSuite sales order
    const salesOrder: NetSuiteSalesOrder = {
      entity: {
        id: order.company?.netsuite_customer_id || order.company?.netsuite_number || '1', // Fallback to company number
      },
      trandate: new Date(order.created_at).toISOString().split('T')[0],
      item: order.order_items?.map((item: any) => ({
        item: {
          id: item.product?.netsuite_id || item.product?.netsuite_itemid || item.product_id.toString(),
        },
        quantity: item.quantity,
        rate: item.unit_price,
        amount: item.total_price,
      })) || [],
      memo: `Order from Qiqi Orders System - Order ID: ${orderId}`,
      subsidiary: order.company?.subsidiary?.netsuite_id ? {
        id: order.company.subsidiary.netsuite_id
      } : undefined,
      location: order.company?.location?.netsuite_id ? {
        id: order.company.location.netsuite_id
      } : undefined,
    };

    // Create sales order in NetSuite
    const netsuiteOrder = await netsuite.createSalesOrder(salesOrder);

    // Update order in Supabase with NetSuite ID
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        netsuite_sales_order_id: netsuiteOrder.id,
        netsuite_status: 'created',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('Error updating order with NetSuite ID:', updateError);
      return NextResponse.json(
        { error: 'Order created in NetSuite but failed to update local record' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Order successfully created in NetSuite',
      netsuiteOrderId: netsuiteOrder.id,
      orderId: orderId,
    });

  } catch (error: any) {
    console.error('NetSuite order creation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create order in NetSuite' },
      { status: 500 }
    );
  }
}

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

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('netsuite_sales_order_id, netsuite_status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      orderId: orderId,
      netsuiteOrderId: order.netsuite_sales_order_id,
      netsuiteStatus: order.netsuite_status,
      existsInNetSuite: !!order.netsuite_sales_order_id,
    });

  } catch (error: any) {
    console.error('Error checking NetSuite order status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check order status' },
      { status: 500 }
    );
  }
}
