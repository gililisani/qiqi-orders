/**
 * API Route: Auto-save Draft Order
 * 
 * POST /api/orders/auto-save-draft
 * 
 * Automatically saves a draft order when user leaves page/closes browser.
 * Used by beforeunload event handler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderData, orderItems, supportFundItems } = body;

    if (!orderData || !orderData.company_id || !orderData.user_id) {
      return NextResponse.json(
        { error: 'Missing required order data' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if draft order already exists for this user/company
    // Look for most recent draft order created by this user
    const { data: existingDraft, error: checkError } = await supabase
      .from('orders')
      .select('id')
      .eq('company_id', orderData.company_id)
      .eq('user_id', orderData.user_id)
      .eq('status', 'Draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let orderId: string;

    if (existingDraft && !checkError) {
      // Update existing draft
      orderId = existingDraft.id;
      
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          po_number: orderData.po_number || null,
          status: 'Draft',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      // Delete existing items
      await supabase
        .from('order_items')
        .delete()
        .eq('order_id', orderId);
    } else {
      // Create new draft order
      const { data: newOrder, error: createError } = await supabase
        .from('orders')
        .insert({
          company_id: orderData.company_id,
          user_id: orderData.user_id,
          po_number: orderData.po_number || null,
          status: 'Draft'
        })
        .select()
        .single();

      if (createError) throw createError;
      orderId = newOrder.id;
    }

    // Insert order items
    const allItems = [
      ...(orderItems || []).map((item: any, index: number) => ({
        order_id: orderId,
        product_id: item.product_id,
        quantity: item.quantity,
        case_qty: item.case_qty || 0,
        unit_price: item.unit_price,
        total_price: item.total_price,
        is_support_fund_item: false,
        sort_order: index
      })),
      ...(supportFundItems || []).map((item: any, index: number) => ({
        order_id: orderId,
        product_id: item.product_id,
        quantity: item.quantity,
        case_qty: item.case_qty || 0,
        unit_price: item.unit_price,
        total_price: item.total_price,
        is_support_fund_item: true,
        sort_order: (orderItems?.length || 0) + index
      }))
    ];

    if (allItems.length > 0) {
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(allItems);

      if (itemsError) throw itemsError;
    }

    // Calculate totals - fetch company data for support fund calculation
    const { data: companyData } = await supabase
      .from('companies')
      .select(`
        support_fund:support_fund_levels(percent)
      `)
      .eq('id', orderData.company_id)
      .single();

    const regularSubtotal = (orderItems || []).reduce((sum: number, item: any) => sum + (item.total_price || 0), 0);
    const supportFundSubtotal = (supportFundItems || []).reduce((sum: number, item: any) => sum + (item.total_price || 0), 0);
    
    // Calculate support fund percent
    const rawSf = companyData?.support_fund as any;
    const supportFundPercent = Array.isArray(rawSf)
      ? (rawSf[0]?.percent || 0)
      : (rawSf?.percent || 0);
    const supportFundEarned = regularSubtotal * (supportFundPercent / 100);
    const supportFundUsed = Math.min(supportFundSubtotal, supportFundEarned);
    const additionalCost = Math.max(0, supportFundSubtotal - supportFundEarned);
    const finalTotal = regularSubtotal + additionalCost;

    // Update order totals
    const { error: totalsError } = await supabase
      .from('orders')
      .update({
        total_value: finalTotal,
        support_fund_used: supportFundUsed,
        credit_earned: supportFundEarned
      })
      .eq('id', orderId);

    if (totalsError) throw totalsError;

    return NextResponse.json({
      success: true,
      orderId
    });
  } catch (error: any) {
    console.error('Error auto-saving draft:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to auto-save draft' },
      { status: 500 }
    );
  }
}

