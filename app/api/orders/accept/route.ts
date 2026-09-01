import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { callRouteHandler } from '../../../../lib/internalRoute';
import { shipmentTypeByCode } from '../../../../lib/shipmentTypes';
import { countryToken } from '../../../../lib/fulfillment/normalize';
import { POST as pushSoHandler } from '../../netsuite/push-so/route';
import { POST as recoverSoHandler } from '../../netsuite/recover-so/route';
import { POST as shipHeroPushHandler } from '../../fulfillment/shiphero/push/route';

/**
 * POST /api/orders/accept  { orderId }
 *
 * "Accept Order" — the one admin action that takes an Open order into
 * fulfillment: NetSuite Sales Order first (hard requirement — the SO number
 * is part of the warehouse order number), then the ShipHero push. Composes
 * the existing single-step routes (push-so / recover-so / shiphero push) so
 * their duplicate guards, repricing checks and idempotency stay intact.
 *
 * Also accepts an order that is already In Process with an SO but not yet at
 * the warehouse (a previous accept that failed halfway) — it resumes at the
 * warehouse step.
 *
 * Failure semantics: if NetSuite succeeds and ShipHero fails, the order stays
 * In Process with its SO and the response carries step:'warehouse' — the
 * admin retries via "Send to ShipHero" (or accept again).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminWithPermission(request, 'orders:edit');

    const { orderId } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        netsuite_so_id,
        so_number,
        shipment_type,
        external_fulfillment_id,
        company:companies(ship_to_country)
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const company = Array.isArray(order.company) ? order.company[0] : order.company;

    const isFreshAccept = order.status === 'Open' && !order.netsuite_so_id;
    const isResume =
      order.status === 'In Process' && !!order.netsuite_so_id && !order.external_fulfillment_id;
    if (!isFreshAccept && !isResume) {
      return NextResponse.json(
        { error: `Only Open orders can be accepted (this order is "${order.status}").` },
        { status: 409 },
      );
    }

    // Everything the warehouse order number needs must exist BEFORE we touch
    // NetSuite, so a bad setup fails cleanly instead of half-way.
    if (!shipmentTypeByCode(order.shipment_type)) {
      return NextResponse.json(
        { error: "Set the order's Shipment Type before accepting it." },
        { status: 400 },
      );
    }
    if (!countryToken(company?.ship_to_country)) {
      return NextResponse.json(
        { error: 'The company has no Ship To country — needed for the warehouse order number.' },
        { status: 400 },
      );
    }

    // ---- Step 1: NetSuite Sales Order ----
    let soNumber: string | null = order.so_number ?? null;
    if (!order.netsuite_so_id) {
      const push = await callRouteHandler(pushSoHandler, request, { orderId });
      if (push.ok) {
        soNumber = push.data.soNumber ?? null;
      } else {
        // A slow push may have created the SO anyway — recover by externalId
        // (never creates a duplicate) before giving up.
        const recover = await callRouteHandler(recoverSoHandler, request, { orderId });
        if (recover.ok && recover.data.recovered) {
          soNumber = recover.data.soNumber ?? null;
        } else {
          return NextResponse.json(
            {
              error: push.data.error || 'NetSuite Sales Order creation failed.',
              step: 'netsuite',
              violations: push.data.violations,
            },
            { status: push.status >= 400 && push.status < 500 ? push.status : 502 },
          );
        }
      }
    }

    // ---- Step 2: warehouse (ShipHero) push ----
    const wh = await callRouteHandler(shipHeroPushHandler, request, { orderId });
    if (!wh.ok) {
      return NextResponse.json(
        {
          error: wh.data.error || 'Warehouse push failed.',
          step: 'warehouse',
          soNumber,
        },
        { status: wh.status >= 400 && wh.status < 500 ? wh.status : 502 },
      );
    }

    // ---- Client-visible acceptance entry ----
    const { data: adminProfile } = await supabase
      .from('admins')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();

    await supabase.from('order_history').insert([
      {
        action_type: 'status_change',
        order_id: orderId,
        status_from: 'Open',
        status_to: 'In Process',
        notes: 'Order accepted',
        changed_by_id: user.id,
        changed_by_name: adminProfile?.name || 'Qiqi',
        changed_by_role: 'admin',
        visible_to_client: true,
      },
    ]);

    return NextResponse.json({
      success: true,
      soNumber,
      warehouseDryRun: !!wh.data.dryRun,
      externalId: wh.data.externalId ?? null,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('accept order error:', error);
    return NextResponse.json({ error: error.message || 'Failed to accept order' }, { status: 500 });
  }
}
