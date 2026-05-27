import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdmin,
} from '../../../../platform/auth/guards';

/**
 * POST /api/netsuite/unlink-order
 * Body: { orderId: string }
 *
 * Detaches an order from its NetSuite Sales Order and (if present) Invoice.
 * The NS records themselves are NOT touched — this is purely a Hub-side
 * unlink so the admin can re-enter a different SO number when the NS
 * record has been deleted and recreated.
 *
 * Clears: so_number, netsuite_so_id, invoice_number, netsuite_invoice_id,
 *         netsuite_invoice_date, netsuite_invoice_status.
 *
 * After unlink, the order detail page's existing reconcile-on-load flow
 * will validate any newly-entered SO# the next time the page renders —
 * still zero NS calls until the admin enters a new number.
 *
 * Logs an entry to order_history so the audit trail captures who unlinked
 * and what the prior NS references were.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json(
        { error: 'orderId is required' },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleClient();

    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select(
        'id, status, so_number, netsuite_so_id, invoice_number, netsuite_invoice_id',
      )
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!order.netsuite_so_id && !order.netsuite_invoice_id) {
      return NextResponse.json(
        { error: 'This order is not linked to NetSuite — nothing to unlink.' },
        { status: 400 },
      );
    }

    const prior = {
      so_number: order.so_number,
      netsuite_so_id: order.netsuite_so_id,
      invoice_number: order.invoice_number,
      netsuite_invoice_id: order.netsuite_invoice_id,
    };

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        so_number: null,
        netsuite_so_id: null,
        invoice_number: null,
        netsuite_invoice_id: null,
        netsuite_invoice_date: null,
        netsuite_invoice_status: null,
        invoice_amount_remaining: null,
        invoice_due_date: null,
      })
      .eq('id', orderId);

    if (updateError) {
      return NextResponse.json(
        { error: `Failed to unlink order: ${updateError.message}` },
        { status: 500 },
      );
    }

    // Audit trail. Wrapped in try/catch so a logging failure doesn't roll
    // back the unlink itself.
    try {
      const noteParts: string[] = [];
      if (prior.so_number || prior.netsuite_so_id) {
        noteParts.push(
          `SO ${prior.so_number ?? `id:${prior.netsuite_so_id}`}`,
        );
      }
      if (prior.invoice_number || prior.netsuite_invoice_id) {
        noteParts.push(
          `Invoice ${prior.invoice_number ?? `id:${prior.netsuite_invoice_id}`}`,
        );
      }
      const noteSuffix =
        noteParts.length > 0 ? ` (was: ${noteParts.join(', ')})` : '';
      await supabase.from('order_history').insert([
        {
          order_id: orderId,
          status_from: order.status,
          status_to: order.status,
          notes: `NetSuite link cleared${noteSuffix}. NS records were not deleted.`,
          changed_by_name: 'System',
          changed_by_role: 'admin',
        },
      ]);
    } catch (logError) {
      console.error('unlink-order: failed to write history entry', logError);
    }

    return NextResponse.json({ success: true, prior });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('unlink-order error:', error);
    return NextResponse.json(
      { error: error.message || 'Unlink failed' },
      { status: 500 },
    );
  }
}
