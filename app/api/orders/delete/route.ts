/**
 * API Route: Delete Order
 * 
 * DELETE /api/orders/delete
 * 
 * Deletes an order and all related records (items, documents, history).
 * Only allowed for Cancelled or Draft orders.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAnyRole } from '../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../lib/netsuite';

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireAnyRole(request, ['admin', 'client']);

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // Fetch order including NetSuite linkage
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('status, company_id, user_id, netsuite_so_id, netsuite_invoice_id')
      .eq('id', orderId)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const isAdmin = user.roles.includes('admin');
    const hasNsLink = !!(order.netsuite_so_id || order.netsuite_invoice_id);

    // Product rule: deletes ONLY when status='Cancelled'. Applies to both
    // admin and client paths. Drafts must be cancelled first then deleted —
    // cleaner lifecycle and a proper audit trail than direct draft-delete.
    if (order.status !== 'Cancelled') {
      return NextResponse.json(
        {
          error: `Cannot delete order with status "${order.status}". Only Cancelled orders can be deleted — cancel the order first if you want to remove it.`,
        },
        { status: 403 },
      );
    }

    // Per-role scope check (kept after the status gate so the error message
    // above always reflects the real product rule, not "access denied").
    if (!isAdmin) {
      const { data: clientRow, error: clientError } = await supabase
        .from('clients')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();
      if (clientError) throw clientError;
      if (!clientRow || clientRow.company_id !== order.company_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      // Clients can never delete NS-linked orders — NetSuite cleanup is
      // admin-only because it may need to delete NS records too.
      if (hasNsLink) {
        return NextResponse.json(
          { error: 'Only an admin can delete an order that has been pushed to NetSuite.' },
          { status: 403 },
        );
      }
    }

    // NS cleanup: only when admin is deleting a NS-linked order. The route
    // tries to delete the NS Invoice + SO; payments applied to the invoice
    // block deletion entirely.
    if (hasNsLink) {

      const ns = createNetSuiteAPI();

      // Block if the invoice has any Customer Payment applied
      if (order.netsuite_invoice_id) {
        const paymentIds = await ns.getInvoicePayments(order.netsuite_invoice_id);
        if (paymentIds.length > 0) {
          return NextResponse.json(
            {
              error: `Cannot delete: NetSuite invoice ${order.netsuite_invoice_id} has ${paymentIds.length} payment(s) applied. Reverse the payment in NetSuite first.`,
            },
            { status: 409 }
          );
        }

        // Delete invoice in NS
        try {
          await ns.deleteInvoice(order.netsuite_invoice_id);
        } catch (e: any) {
          return NextResponse.json(
            { error: `Failed to delete NetSuite invoice: ${e.message}` },
            { status: 500 }
          );
        }
      }

      // Delete SO in NS
      if (order.netsuite_so_id) {
        try {
          await ns.deleteSalesOrder(order.netsuite_so_id);
        } catch (e: any) {
          return NextResponse.json(
            { error: `Failed to delete NetSuite Sales Order: ${e.message}` },
            { status: 500 }
          );
        }
      }
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
    if (error instanceof Response) return error;
    console.error('Error in delete order API:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete order' },
      { status: 500 }
    );
  }
}

