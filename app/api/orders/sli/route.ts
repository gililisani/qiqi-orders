import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSLIFromOrder } from '../../../../lib/sliGenerator';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Fetch order data with related information
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        *,
        company:companies(*),
        order_items(
          *,
          product:products(*)
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Generate SLI
    const sliBuffer = await generateSLIFromOrder(order);

    // Return the Excel file
    return new NextResponse(sliBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="SLI-${order.order_number || orderId}.xlsx"`,
      },
    });

  } catch (error: any) {
    console.error('Error generating SLI:', error);
    return NextResponse.json(
      { error: 'Failed to generate SLI document' },
      { status: 500 }
    );
  }
}
