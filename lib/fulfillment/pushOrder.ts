import type { SupabaseClient } from '@supabase/supabase-js';
import { getFulfillmentProvider } from './index';
import { buildNormalizedOrder, countryToken } from './normalize';
import { shipmentTypeByCode } from '../shipmentTypes';

/**
 * ShipHero push core — extracted from /api/fulfillment/shiphero/push
 * (2026-09-06) so the payment-hold auto-release (webhook/cron context, no
 * admin session) can push exactly the way the admin button does.
 *
 * Behavior preserved from the route: idempotent (refuses a live duplicate,
 * re-pushes over a cancelled warehouse order), NetSuite-first, validates every
 * segment of the warehouse order number, honors the dry-run gate.
 *
 * One rule added (owner spec 2026-09-06): a successful push ALWAYS clears a
 * payment hold — the hold's whole meaning is "not at the warehouse until
 * paid", so the badge must never claim 'held' on an order that's packing.
 * Manual pushes on held orders are a deliberate admin override (the UI
 * confirms first); the payment-release path clears the hold before calling.
 */

export type PushOrderOutcome =
  | { ok: true; dryRun: true; request: unknown }
  | { ok: true; dryRun: false; externalId: string | null; warning?: string }
  | { ok: false; code: PushOrderErrorCode; message: string; httpStatus: number };

export type PushOrderErrorCode =
  | 'not_found'
  | 'already_pushed'
  | 'no_so'
  | 'no_company'
  | 'no_shipment_type'
  | 'no_so_number'
  | 'no_country'
  | 'no_items'
  | 'provider_error';

export async function pushOrderToWarehouse(
  supabase: SupabaseClient,
  orderId: string,
  opts: { trigger: 'manual' | 'payment_release' },
): Promise<PushOrderOutcome> {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(`
      id,
      so_number,
      po_number,
      created_at,
      status,
      hold,
      shipment_type,
      netsuite_so_id,
      external_fulfillment_id,
      fulfillment_status,
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
    return { ok: false, code: 'not_found', message: 'Order not found', httpStatus: 404 };
  }

  // Idempotency guard — but a CANCELLED warehouse order is dead, so a
  // re-push creates a fresh one (reinstated orders; new SO number = new
  // warehouse order number, no collision on ShipHero's side).
  if (order.external_fulfillment_id && order.fulfillment_status !== 'cancelled') {
    return {
      ok: false,
      code: 'already_pushed',
      message: `This order was already sent to ShipHero (${order.external_fulfillment_id}).`,
      httpStatus: 409,
    };
  }

  // NetSuite-first is a hard requirement: the order must have a NetSuite Sales
  // Order before it can go to the warehouse.
  if (!order.netsuite_so_id) {
    return {
      ok: false,
      code: 'no_so',
      message: 'Create the NetSuite Sales Order before sending this order to ShipHero.',
      httpStatus: 400,
    };
  }

  const company = Array.isArray(order.company) ? order.company[0] : order.company;
  if (!company) {
    return { ok: false, code: 'no_company', message: 'Order has no company', httpStatus: 400 };
  }

  // The warehouse order number is {SO}-{Country}-{type code} — every segment
  // must exist before we push, so failures are clear instead of a malformed
  // number landing at BrandFox.
  if (!shipmentTypeByCode(order.shipment_type)) {
    return {
      ok: false,
      code: 'no_shipment_type',
      message: "Set the order's Shipment Type before sending it to the warehouse.",
      httpStatus: 400,
    };
  }
  if (!order.so_number?.trim()) {
    return {
      ok: false,
      code: 'no_so_number',
      message: 'The order has no NetSuite SO number yet — needed for the warehouse order number.',
      httpStatus: 400,
    };
  }
  if (!countryToken(company.ship_to_country)) {
    return {
      ok: false,
      code: 'no_country',
      message: 'The company has no Ship To country — needed for the warehouse order number.',
      httpStatus: 400,
    };
  }

  const normalized = buildNormalizedOrder({
    order: {
      id: order.id,
      so_number: order.so_number,
      po_number: order.po_number,
      created_at: order.created_at,
      shipment_type: order.shipment_type,
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
    return {
      ok: false,
      code: 'no_items',
      message: 'Order has no fulfillable line items (missing SKUs).',
      httpStatus: 400,
    };
  }

  const provider = getFulfillmentProvider('shiphero');
  let result;
  try {
    result = await provider.createOrder(normalized);
  } catch (e: any) {
    // Never throw — the payment-release caller runs inside a webhook/cron.
    console.error('shiphero push error:', e);
    return {
      ok: false,
      code: 'provider_error',
      message: e?.message || 'Failed to send order to ShipHero',
      httpStatus: 500,
    };
  }

  // Dry-run: report what would be sent, write nothing.
  if (result.dryRun) {
    return { ok: true, dryRun: true, request: result.request };
  }

  const holdCleared = order.hold === 'payment_hold';
  const { error: updateError } = await supabase
    .from('orders')
    .update({
      fulfillment_provider: provider.name,
      external_fulfillment_id: result.externalId,
      external_fulfillment_legacy_id: result.externalLegacyId ?? null,
      fulfillment_status: 'pending',
      fulfillment_synced_at: new Date().toISOString(),
      // At the warehouse = the hold's question is settled, whichever way.
      ...(holdCleared ? { hold: null } : {}),
    })
    .eq('id', orderId);

  if (updateError) {
    console.error('shiphero push: failed to store fulfillment id:', updateError);
    // The order WAS created in ShipHero — surface success so the caller knows,
    // but flag that the Hub link didn't save.
    return {
      ok: true,
      dryRun: false,
      externalId: result.externalId,
      warning: 'Order created in ShipHero but the Hub link failed to save.',
    };
  }

  await supabase.from('order_history').insert([
    {
      action_type: 'order_updated',
      order_id: orderId,
      status_from: order.status,
      status_to: order.status,
      notes:
        opts.trigger === 'payment_release'
          ? `Pushed to ShipHero automatically after payment (id ${result.externalId}).`
          : `Sent to ShipHero for fulfillment (id ${result.externalId}).${
              holdCleared ? ' Payment hold cleared — sent to the warehouse before payment (admin decision).' : ''
            }`,
      changed_by_name: 'System',
      changed_by_role: 'admin',
    },
  ]);

  return { ok: true, dryRun: false, externalId: result.externalId };
}
