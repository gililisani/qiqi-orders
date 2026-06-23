import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../../platform/auth/guards';
import { getFulfillmentProvider } from '../../../../../lib/fulfillment';
import { buildNormalizedOrder } from '../../../../../lib/fulfillment/normalize';

/**
 * POST /api/fulfillment/shiphero/push  { orderId }
 *
 * Admin-only manual push of a Hub order to ShipHero, mirroring the NetSuite
 * "push SO" action. Idempotent: refuses if the order already has a fulfillment
 * id. Respects the dry-run gate — in dry-run nothing is sent and nothing is
 * written; we return the exact payload that WOULD be sent for review.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        so_number,
        po_number,
        created_at,
        status,
        external_fulfillment_id,
        company:companies(
          company_name,
          ship_to_contact_name,
          ship_to_contact_email,
          ship_to_contact_phone,
          ship_to_street_line_1,
          ship_to_street_line_2,
          ship_to_city,
          ship_to_state,
          ship_to_postal_code,
          ship_to_country
        ),
        order_items(
          id,
          quantity,
          unit_price,
          product:Products(sku, item_name)
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.external_fulfillment_id) {
      return NextResponse.json(
        { error: `This order was already sent to ShipHero (${order.external_fulfillment_id}).` },
        { status: 409 },
      );
    }

    const company = Array.isArray(order.company) ? order.company[0] : order.company;
    if (!company) {
      return NextResponse.json({ error: 'Order has no company' }, { status: 400 });
    }

    const normalized = buildNormalizedOrder({
      order: {
        id: order.id,
        so_number: order.so_number,
        po_number: order.po_number,
        created_at: order.created_at,
      },
      company,
      items: (order.order_items ?? []).map((it: any) => ({
        id: it.id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        product: Array.isArray(it.product) ? it.product[0] : it.product,
      })),
    });

    if (normalized.lineItems.length === 0) {
      return NextResponse.json({ error: 'Order has no fulfillable line items (missing SKUs).' }, { status: 400 });
    }

    const provider = getFulfillmentProvider('shiphero');
    const result = await provider.createOrder(normalized);

    // Dry-run: report what would be sent, write nothing.
    if (result.dryRun) {
      return NextResponse.json({ success: true, dryRun: true, request: result.request });
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        fulfillment_provider: provider.name,
        external_fulfillment_id: result.externalId,
        external_fulfillment_legacy_id: result.externalLegacyId ?? null,
        fulfillment_status: 'pending',
        fulfillment_synced_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('shiphero push: failed to store fulfillment id:', updateError);
      // The order WAS created in ShipHero — surface success so the admin knows,
      // but flag that the Hub link didn't save.
      return NextResponse.json({
        success: true,
        externalId: result.externalId,
        warning: 'Order created in ShipHero but the Hub link failed to save.',
      });
    }

    await supabase.from('order_history').insert([
      {
        action_type: 'order_updated',
        order_id: orderId,
        status_from: order.status,
        status_to: order.status,
        notes: `Sent to ShipHero for fulfillment (id ${result.externalId}).`,
        changed_by_name: 'System',
        changed_by_role: 'admin',
      },
    ]);

    return NextResponse.json({ success: true, externalId: result.externalId });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('shiphero push error:', error);
    return NextResponse.json({ error: error.message || 'Failed to send order to ShipHero' }, { status: 500 });
  }
}
