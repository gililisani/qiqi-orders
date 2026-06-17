import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';
import { getNetSuiteItem } from '../../../../lib/netsuiteItemMap';

/**
 * POST /api/orders/shipping
 * Body: { orderId: string, shippingAmount: number | null }
 *
 * Admin-only. Sets (or clears, when null/0) the shipping charge on an order.
 * Shipping is a billing charge: in NetSuite it lives on the INVOICE only (the
 * shipping item is not accepted on a Sales Order via the API), so:
 *   - No NS invoice yet → just store the amount; it's added when the invoice
 *     is created.
 *   - NS invoice exists & unpaid → add/update/remove the shipping line on it,
 *     then refresh the cached invoice totals.
 *   - NS invoice paid → blocked (a paid order is locked).
 *
 * Allowed only while the order is Draft / Open / In Process / Ready.
 */
const EDITABLE_STATUSES = ['Draft', 'Open', 'In Process', 'Ready'];

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const orderId: string | undefined = body?.orderId;
    const rawAmount = body?.shippingAmount;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    // Normalize the amount: null / 0 / blank => remove. Otherwise a non-negative
    // number rounded to cents.
    let shippingAmount: number | null = null;
    if (rawAmount !== null && rawAmount !== undefined && rawAmount !== '') {
      const n = Number(rawAmount);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json(
          { error: 'Shipping must be a non-negative dollar amount.' },
          { status: 400 },
        );
      }
      shippingAmount = Math.round(n * 100) / 100;
      if (shippingAmount === 0) shippingAmount = null;
    }

    const supabase = createServiceRoleClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        'id, status, shipping_amount, netsuite_invoice_id, netsuite_invoice_status, invoice_amount_remaining',
      )
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!EDITABLE_STATUSES.includes(order.status)) {
      return NextResponse.json(
        { error: `Shipping can't be changed on a ${order.status} order.` },
        { status: 409 },
      );
    }

    // A paid invoice locks the order. Tolerant match on the cached status, plus
    // a $0-remaining signal.
    const statusLc = (order.netsuite_invoice_status || '').toLowerCase();
    const isPaid =
      statusLc.includes('paid') ||
      (order.netsuite_invoice_id != null && order.invoice_amount_remaining === 0);
    if (isPaid) {
      return NextResponse.json(
        { error: 'This order is paid — shipping can no longer be changed.' },
        { status: 409 },
      );
    }

    // --- Update NetSuite invoice first (if one exists) so we don't persist a
    // Hub value we couldn't reflect in NS. ---
    let invoiceTotals: { amountRemaining: number | null; status: string } | null = null;
    if (order.netsuite_invoice_id) {
      const ship = await getNetSuiteItem(supabase, 'shipping');
      const ns = createNetSuiteAPI();
      try {
        if (shippingAmount && shippingAmount > 0) {
          await ns.upsertInvoiceChargeLine(order.netsuite_invoice_id, ship.nsId, shippingAmount);
        } else {
          await ns.removeInvoiceChargeLine(order.netsuite_invoice_id, ship.nsId);
        }
        // Refresh cached invoice totals — the invoice total just changed.
        const details = await ns.getInvoiceDetails(order.netsuite_invoice_id);
        invoiceTotals = { amountRemaining: details.amountRemaining, status: details.status };
      } catch (e: any) {
        return NextResponse.json(
          { error: `Failed to update the NetSuite invoice: ${e?.message ?? 'unknown error'}` },
          { status: 502 },
        );
      }
    }

    const patch: Record<string, unknown> = { shipping_amount: shippingAmount };
    if (invoiceTotals) {
      patch.invoice_amount_remaining = invoiceTotals.amountRemaining;
      if (invoiceTotals.status) patch.netsuite_invoice_status = invoiceTotals.status;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(patch)
      .eq('id', orderId);
    if (updateError) {
      return NextResponse.json(
        { error: `Failed to save shipping: ${updateError.message}` },
        { status: 500 },
      );
    }

    // Audit trail.
    const prior = order.shipping_amount ?? 0;
    const next = shippingAmount ?? 0;
    const verb = next === 0 ? 'removed' : prior === 0 ? 'added' : 'updated';
    await supabase.from('order_history').insert([{
      order_id: orderId,
      status_from: order.status,
      status_to: order.status,
      notes:
        `Shipping ${verb}: $${prior.toFixed(2)} → $${next.toFixed(2)}` +
        (order.netsuite_invoice_id ? ' (NetSuite invoice updated)' : ''),
      changed_by_name: 'System',
      changed_by_role: 'admin',
    }]);

    return NextResponse.json({
      success: true,
      shippingAmount,
      invoiceUpdated: !!order.netsuite_invoice_id,
      ...(invoiceTotals ? { invoiceAmountRemaining: invoiceTotals.amountRemaining } : {}),
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('shipping route error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update shipping' },
      { status: 500 },
    );
  }
}
