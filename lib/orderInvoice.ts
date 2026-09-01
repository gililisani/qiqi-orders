import type { SupabaseClient } from '@supabase/supabase-js';
import { createNetSuiteAPI } from './netsuite';
import { getNetSuiteItem } from './netsuiteItemMap';

/**
 * NetSuite invoice creation for a Hub order — extracted from
 * /api/netsuite/create-invoice so the fulfillment automation (cron context,
 * no user session) can invoice an order the moment the warehouse marks it
 * packed. Behavior is identical to the route's original inline logic:
 * detect-first (never transforms an SO that already has an invoice), adds the
 * shipping line only to freshly-created invoices, writes the invoice columns
 * + status 'Ready' + a history row.
 */

export type CreateInvoiceOutcome =
  | { ok: true; linked: boolean; result: any }
  | { ok: false; code: 'not_found' | 'no_so' | 'already_invoiced' | 'so_missing_in_ns'; message: string };

export async function createInvoiceForOrder(
  supabase: SupabaseClient,
  orderId: string,
): Promise<CreateInvoiceOutcome> {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, status, netsuite_so_id, netsuite_invoice_id, shipping_amount')
    .eq('id', orderId)
    .single();

  if (orderError || !order) {
    return { ok: false, code: 'not_found', message: 'Order not found' };
  }

  if (!order.netsuite_so_id) {
    return {
      ok: false,
      code: 'no_so',
      message: 'No NetSuite Sales Order linked to this order. Push to NetSuite first.',
    };
  }

  if (order.netsuite_invoice_id) {
    return {
      ok: false,
      code: 'already_invoiced',
      message: 'An invoice already exists for this order (ID: ' + order.netsuite_invoice_id + ').',
    };
  }

  const ns = createNetSuiteAPI();

  // DETECT-FIRST: an invoice may already exist in NetSuite for this SO —
  // created directly in NS (not via the Hub), or by a prior partial run.
  // If so, link to it instead of transforming the SO again, which would
  // create a DUPLICATE invoice.
  let result;
  let linked = false;
  let existing = null;
  try {
    existing = await ns.findInvoiceForSalesOrder(order.netsuite_so_id);
  } catch (e: any) {
    // Non-fatal — fall through to create. Worst case we attempt a transform.
    console.error('create-invoice: existing-invoice lookup failed:', e?.message);
  }

  if (existing) {
    linked = true;
    try {
      result = await ns.getInvoiceDetails(existing.nsInvoiceId);
    } catch (e: any) {
      console.error('create-invoice: getInvoiceDetails failed for existing invoice:', e?.message);
      result = existing;
    }
  } else {
    try {
      result = await ns.createInvoiceFromSO(order.netsuite_so_id);
    } catch (e: any) {
      // If the SO no longer exists in NS (e.g. deleted manually), clear the
      // stale link so the admin can push the order to NetSuite again.
      if (e?.message?.includes('NetSuite 404')) {
        await supabase
          .from('orders')
          .update({ netsuite_so_id: null, so_number: null })
          .eq('id', orderId);
        return {
          ok: false,
          code: 'so_missing_in_ns',
          message:
            'The Sales Order no longer exists in NetSuite. The link has been cleared — refresh the page and click "Push to NetSuite" to recreate it.',
        };
      }
      throw e;
    }
  }

  // Shipping lives on the invoice, never the SO. Skip for a linked existing
  // invoice — its lines already reflect whatever was set in NetSuite.
  if (!linked && order.shipping_amount && order.shipping_amount > 0) {
    try {
      const ship = await getNetSuiteItem(supabase, 'shipping');
      await ns.upsertInvoiceChargeLine(result.nsInvoiceId, ship.nsId, order.shipping_amount);
      result = await ns.getInvoiceDetails(result.nsInvoiceId); // refresh totals w/ shipping
    } catch (e: any) {
      console.error('create-invoice: failed to add shipping line:', e?.message);
    }
  }

  await supabase
    .from('orders')
    .update({
      netsuite_invoice_id: result.nsInvoiceId,
      invoice_number: result.invoiceNumber,
      netsuite_invoice_date: result.invoiceDate,
      netsuite_invoice_status: result.status,
      invoice_amount_remaining: result.amountRemaining,
      invoice_due_date: result.dueDate,
      status: 'Ready',
    })
    .eq('id', orderId);

  await supabase.from('order_history').insert([
    {
      action_type: 'status_change',
      order_id: orderId,
      status_from: order.status,
      status_to: 'Ready',
      notes: linked
        ? `NetSuite Invoice linked (already existed in NetSuite): ${result.invoiceNumber}`
        : `NetSuite Invoice created: ${result.invoiceNumber}`,
      changed_by_name: 'System',
      changed_by_role: 'admin',
    },
  ]);

  return { ok: true, linked, result };
}
