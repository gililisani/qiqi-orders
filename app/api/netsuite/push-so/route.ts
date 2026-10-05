import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';
import { validateOrderPricing } from '../../../../lib/orderPricing';
import { loadFulfillmentRoute } from '../../../../lib/fulfillmentRouting';

export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'orders:edit');

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Fetch order with all NS-relevant fields. The fulfilling warehouse is
    // resolved separately (lib/fulfillmentRouting) from the tenant's settings.
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        po_number,
        created_at,
        status,
        total_value,
        credit_earned,
        support_fund_used,
        netsuite_so_id,
        company_id,
        company:companies(
          company_name,
          netsuite_number,
          netsuite_internal_id,
          subsidiary:subsidiaries(name, netsuite_id),
          price_tier,
          class:classes(name),
          support_fund:support_fund_levels(percent)
        ),
        order_items(
          quantity,
          unit_price,
          total_price,
          is_support_fund_item,
          price_override,
          product:Products(sku, item_name, netsuite_name, price_americas, price_international, salon_price, msrp, qualifies_for_credit_earning)
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.netsuite_so_id) {
      return NextResponse.json(
        { error: 'This order already has a NetSuite SO (ID: ' + order.netsuite_so_id + ').' },
        { status: 409 }
      );
    }

    // --- Server-side price validation. The stored prices were written by the
    // browser (RLS restricts rows, not columns) and become the NetSuite SO
    // rates — so recompute everything from the catalog and refuse to push a
    // number we can't reproduce. ---
    const companyRaw: any = Array.isArray(order.company) ? order.company[0] : order.company;
    const pricingCheck = validateOrderPricing({
      items: (order.order_items ?? []) as any[],
      companyClassName: companyRaw?.class?.name ?? null,
      companyPriceTier: companyRaw?.price_tier ?? null,
      supportFundPercent: companyRaw?.support_fund?.percent ?? null,
      orderTotalValue: (order as any).total_value,
      orderCreditEarned: (order as any).credit_earned,
      orderSupportFundUsed: order.support_fund_used,
    });
    if (!pricingCheck.ok) {
      console.error(
        `push-so: pricing validation failed for order ${orderId}:`,
        pricingCheck.violations.map((v) => v.detail).join(' | '),
      );
      return NextResponse.json(
        {
          error:
            'Order pricing does not match the catalog — push blocked. ' +
            'If a product price or the company\'s pricing tier legitimately changed since this order was saved, ' +
            'open the order, re-save it to reprice, and push again.',
          violations: pricingCheck.violations.map((v) => v.detail),
        },
        { status: 409 },
      );
    }

    // Fulfillment routing, resolved NOW from the tenant's settings (a re-push
    // recreates the SO, so it must reflect the current routing — never the
    // frozen orders.location_id snapshot; see the 2026-06-15 CSF re-push bug).
    // Any gap (no "ships from", retired warehouse, CSF switched off) blocks
    // the push with the setting to fix — the Hub never guesses a warehouse.
    const route = await loadFulfillmentRoute(supabase, (order as any).company_id);
    if (!route.ok) {
      return NextResponse.json(
        { error: `Can't create the Sales Order — ${route.error}` },
        { status: 409 },
      );
    }
    const orderForNs: any = {
      ...order,
      company: {
        ...companyRaw,
        location: {
          location_name: route.warehouse.name,
          netsuite_id: route.warehouse.netsuiteId,
          subsidiary: { netsuite_id: route.warehouseSubsidiaryNetsuiteId ?? null },
        },
      },
      fulfillment: { crossSubsidiary: route.crossSubsidiary },
    };
    // Stamped back onto the order: the warehouse actually pushed.
    const resolvedLocationId = route.warehouse.id;

    const ns = createNetSuiteAPI();
    const { nsSOId, soNumber } = await ns.pushOrderToNetSuite(orderForNs);

    // Write SO ID + number back, advance status to "In Process", and snapshot
    // the location actually pushed so the order record stays in sync.
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        netsuite_so_id: nsSOId,
        so_number: soNumber,
        status: 'In Process',
        location_id: resolvedLocationId,
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('Failed to store NS SO ID in Hub:', updateError);
      // Return success anyway — the SO was created, user can note the number manually
    }

    // Log to order history
    await supabase.from('order_history').insert([{
      action_type: 'status_change',
      order_id: orderId,
      status_from: order.status,
      status_to: 'In Process',
      notes: `NetSuite Sales Order created: ${soNumber}`,
      changed_by_name: 'System',
      changed_by_role: 'admin',
    }]);

    return NextResponse.json({ success: true, nsSOId, soNumber });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('push-so error:', error);
    return NextResponse.json({ error: error.message || 'Failed to create NetSuite SO' }, { status: 500 });
  }
}
