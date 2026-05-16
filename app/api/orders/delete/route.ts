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

    // Authorization
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
      if (order.status === 'Draft' && order.user_id !== user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      // Clients can only ever delete their own Draft orders, never NS-linked ones
      if (hasNsLink || order.status !== 'Draft') {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // Status rules:
    // - Without NS link: must be Cancelled or Draft (legacy behavior)
    // - With NS link: admin can delete any status, but NS records must come down too,
    //   and a Customer Payment in NS blocks deletion entirely.
    if (!hasNsLink) {
      if (order.status !== 'Cancelled' && order.status !== 'Draft') {
        return NextResponse.json(
          { error: `Cannot delete order with status "${order.status}". Only Cancelled or Draft orders can be deleted.` },
          { status: 403 }
        );
      }
    } else {
      // Admin-only beyond this point
      if (!isAdmin) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

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

