import { describe, it, expect } from 'vitest';
import {
  buildNormalizedOrder,
  buildWarehouseOrderNumber,
  countryToken,
  splitContactName,
} from '@/lib/fulfillment/normalize';
import {
  isPickupShipment,
  buildShipHeroOrderInput,
  parseShipHeroWebhook,
  parseShipHeroOrderFulfillment,
} from '@/lib/fulfillment/shiphero/mapping';
import type { ShipHeroConfig } from '@/lib/fulfillment/shiphero/config';

const cfg = (over: Partial<ShipHeroConfig> = {}): ShipHeroConfig => ({
  refreshToken: 'r',
  accessToken: null,
  customerAccountId: '97016',
  warehouseId: null,
  shopName: 'Qiqi Hub',
  webhookSecret: 'secret',
  dryRun: true,
  ...over,
});

const hubOrder = {
  order: { id: 'uuid-123', so_number: 'SO-555', po_number: 'PO-9', created_at: '2026-06-23T10:00:00Z' },
  company: {
    company_name: 'Acme Salon',
    ship_to_contact_name: 'Jane Q Doe',
    ship_to_contact_email: 'jane@acme.test',
    ship_to_contact_phone: '555-1212',
    ship_to_street_line_1: '1 Main St',
    ship_to_city: 'Phoenix',
    ship_to_state: 'AZ',
    ship_to_postal_code: '85009',
    ship_to_country: 'US',
  },
  items: [
    { id: 'li-1', quantity: 2, unit_price: 12.5, product: { sku: 'SKU-A', item_name: 'Shampoo' } },
    { id: 'li-2', quantity: 1, unit_price: 7, product: { sku: 'SKU-B', item_name: 'Conditioner' } },
  ],
};

describe('splitContactName', () => {
  it('splits first and last', () => {
    expect(splitContactName('Jane Doe')).toEqual({ firstName: 'Jane', lastName: 'Doe' });
  });
  it('keeps multi-word last name', () => {
    expect(splitContactName('Jane Q Doe')).toEqual({ firstName: 'Jane', lastName: 'Q Doe' });
  });
  it('handles empty', () => {
    expect(splitContactName('  ')).toEqual({ firstName: '', lastName: '' });
  });
});

describe('buildNormalizedOrder', () => {
  it('maps hub order to normalized shape', () => {
    const n = buildNormalizedOrder(hubOrder);
    expect(n.orderId).toBe('uuid-123');
    expect(n.orderNumber).toBe('SO-555'); // SO preferred over PO
    expect(n.shipTo.city).toBe('Phoenix');
    expect(n.lineItems).toHaveLength(2);
    expect(n.lineItems[0]).toMatchObject({ sku: 'SKU-A', quantity: 2, unitPrice: 12.5 });
    // Salted per push — ShipHero refuses reused partner_line_item_ids.
    expect(n.lineItems[0].partnerLineItemId).toMatch(/^li-1\./);
  });

  it('falls back PO then UUID slice for order number', () => {
    const poOnly = buildNormalizedOrder({
      ...hubOrder,
      order: { id: 'abcdef123', so_number: null, po_number: 'PO-9', created_at: 'x' },
    });
    expect(poOnly.orderNumber).toBe('PO-9');
    const noNums = buildNormalizedOrder({ ...hubOrder, order: { id: 'abcdef123456', created_at: 'x' } });
    expect(noNums.orderNumber).toBe('abcdef12');
  });

  it('consolidates same-SKU lines (regular + support-fund) like the NetSuite push', () => {
    const n = buildNormalizedOrder({
      ...hubOrder,
      items: [
        { id: 'li-1', quantity: 72, unit_price: 25, product: { sku: 'FPS0023', item_name: 'Mask' } },
        { id: 'li-2', quantity: 18, unit_price: 15, product: { sku: 'FPS0020', item_name: 'Serum' } },
        // the support-fund line of the same product at the same catalog price
        { id: 'li-3', quantity: 48, unit_price: 25, product: { sku: 'FPS0023', item_name: 'Mask' } },
      ],
    });
    expect(n.lineItems).toHaveLength(2);
    expect(n.lineItems.find((l) => l.sku === 'FPS0023')).toMatchObject({ quantity: 120, unitPrice: 25 });
    expect(n.lineItems.find((l) => l.sku === 'FPS0020')).toMatchObject({ quantity: 18 });
  });

  it('keeps same-SKU lines separate when the unit price differs (NS rule)', () => {
    const n = buildNormalizedOrder({
      ...hubOrder,
      items: [
        { id: 'li-1', quantity: 10, unit_price: 25, product: { sku: 'FPS0023', item_name: 'Mask' } },
        { id: 'li-2', quantity: 5, unit_price: 20, product: { sku: 'FPS0023', item_name: 'Mask' } },
      ],
    });
    expect(n.lineItems).toHaveLength(2);
  });

  it('drops line items with no SKU', () => {
    const n = buildNormalizedOrder({
      ...hubOrder,
      items: [{ id: 'li-1', quantity: 1, unit_price: 1, product: { sku: null } }, ...hubOrder.items],
    });
    expect(n.lineItems).toHaveLength(2);
  });

  it('builds the warehouse order number, tags and shipping line from the shipment type', () => {
    const n = buildNormalizedOrder({
      ...hubOrder,
      order: { ...hubOrder.order, so_number: 'SOIL10999', shipment_type: 'SEA' },
      company: { ...hubOrder.company, ship_to_country: 'Greece' },
    });
    expect(n.orderNumber).toBe('SOIL10999-Greece-SEA'); // owner's doc example
    expect(n.tags).toEqual(['WHOLESALE-SEAFREIGHT']);
    expect(n.shippingLine).toMatchObject({ carrier: 'genericlabel', method: 'genericlabel' });
  });

  it('has no tags and the Cheapest line for Qiqi-Shipping types', () => {
    const n = buildNormalizedOrder({
      ...hubOrder,
      order: { ...hubOrder.order, shipment_type: 'DDP' },
      company: { ...hubOrder.company, ship_to_country: 'Hong Kong' },
    });
    expect(n.orderNumber).toBe('SO-555-HongKong-DDP');
    expect(n.tags).toEqual([]);
    expect(n.shippingLine).toMatchObject({ carrier: 'Cheapest', method: '4' });
  });

  it('strips + signs from the ship-to phone (warehouse spec)', () => {
    const n = buildNormalizedOrder({
      ...hubOrder,
      company: { ...hubOrder.company, ship_to_contact_phone: '+370 685 11530' },
    });
    expect(n.shipTo.phone).toBe('370 685 11530');
  });
});

describe('countryToken / buildWarehouseOrderNumber', () => {
  it('strips spaces and punctuation from country names', () => {
    expect(countryToken('Puerto Rico')).toBe('PuertoRico');
    expect(countryToken('Hong Kong')).toBe('HongKong');
    expect(countryToken('Lithuania')).toBe('Lithuania');
  });

  it('abbreviates US and UK long forms', () => {
    expect(countryToken('United States')).toBe('USA');
    expect(countryToken('US')).toBe('USA');
    expect(countryToken('united states of america')).toBe('USA');
    expect(countryToken('United Kingdom')).toBe('UK');
  });

  it('builds the full {SO}-{Country}-{code} number', () => {
    expect(
      buildWarehouseOrderNumber({ soNumber: 'SOUS10877', country: 'United States', shipmentTypeCode: 'LTL' }),
    ).toBe('SOUS10877-USA-LTL');
    expect(
      buildWarehouseOrderNumber({ soNumber: 'SOUS10654', country: 'Puerto Rico', shipmentTypeCode: 'LABELS' }),
    ).toBe('SOUS10654-PuertoRico-LABELS');
  });

  it('returns null when any segment is missing or the type is unknown', () => {
    expect(buildWarehouseOrderNumber({ soNumber: null, country: 'Greece', shipmentTypeCode: 'SEA' })).toBeNull();
    expect(buildWarehouseOrderNumber({ soNumber: 'SO-1', country: '', shipmentTypeCode: 'SEA' })).toBeNull();
    expect(buildWarehouseOrderNumber({ soNumber: 'SO-1', country: 'Greece', shipmentTypeCode: 'Air Shipping' })).toBeNull();
  });
});

describe('isPickupShipment (tolerant)', () => {
  it('treats all BrandFox generic carrier/method values as pickup', () => {
    expect(isPickupShipment('Generic', null)).toBe(true);
    expect(isPickupShipment('Wholesale Generic', null)).toBe(true);
    expect(isPickupShipment(null, 'genericlabel')).toBe(true);
    expect(isPickupShipment(null, 'Wholesale Generic Label')).toBe(true);
    // tolerant to case / spacing drift
    expect(isPickupShipment('  WHOLESALE   GENERIC ', null)).toBe(true);
  });
  it('treats a real carrier as not pickup', () => {
    expect(isPickupShipment('UPS', 'Ground')).toBe(false);
    expect(isPickupShipment('FedEx', '2Day')).toBe(false);
  });
});

const PUSH_DATE = '2026-06-24T17:00:00.000Z';

describe('buildShipHeroOrderInput', () => {
  it('produces a valid create input scoped to the customer account', () => {
    const input = buildShipHeroOrderInput(buildNormalizedOrder(hubOrder), cfg(), PUSH_DATE);
    expect(input.order_number).toBe('SO-555');
    expect(input.partner_order_id).toBe('uuid-123');
    expect(input.customer_account_id).toBe('97016');
    expect(input.shipping_address.city).toBe('Phoenix');
    expect(input.shipping_address.first_name).toBe('Jane');
    expect(input.line_items[0]).toMatchObject({ sku: 'SKU-A', quantity: 2, price: '12.50' });
    expect(input.line_items[0].partner_line_item_id).toMatch(/^li-1\./);
  });

  it('uses the passed submission date as order_date, not the hub creation date', () => {
    const input = buildShipHeroOrderInput(buildNormalizedOrder(hubOrder), cfg(), PUSH_DATE);
    expect(input.order_date).toBe(PUSH_DATE);
    expect(input.order_date).not.toBe(hubOrder.order.created_at);
  });

  it('omits customer_account_id when not configured', () => {
    const input = buildShipHeroOrderInput(buildNormalizedOrder(hubOrder), cfg({ customerAccountId: null }), PUSH_DATE);
    expect(input.customer_account_id).toBeUndefined();
  });

  it('carries the shipment-type tags and shipping line into the create input', () => {
    const n = buildNormalizedOrder({
      ...hubOrder,
      order: { ...hubOrder.order, so_number: 'SOIL10776', shipment_type: 'AIR' },
      company: { ...hubOrder.company, ship_to_country: 'Lithuania' },
    });
    const input = buildShipHeroOrderInput(n, cfg(), PUSH_DATE);
    expect(input.order_number).toBe('SOIL10776-Lithuania-AIR');
    expect(input.tags).toEqual(['WHOLESALE-AIRFREIGHT']);
    expect(input.shipping_lines).toMatchObject({ carrier: 'genericlabel', method: 'genericlabel' });
  });

  it('omits tags and falls back to the generic line without a shipment type', () => {
    const input = buildShipHeroOrderInput(buildNormalizedOrder(hubOrder), cfg(), PUSH_DATE);
    expect(input.tags).toBeUndefined();
    expect(input.shipping_lines).toMatchObject({ carrier: 'genericlabel', method: 'genericlabel' });
  });

  it('pins line-item warehouse_id only when configured', () => {
    const without = buildShipHeroOrderInput(buildNormalizedOrder(hubOrder), cfg(), PUSH_DATE);
    expect(without.line_items[0].warehouse_id).toBeUndefined();
    const withWh = buildShipHeroOrderInput(buildNormalizedOrder(hubOrder), cfg({ warehouseId: 'V2FyZWhvdXNlOjgxODkz' }), PUSH_DATE);
    expect(withWh.line_items[0].warehouse_id).toBe('V2FyZWhvdXNlOjgxODkz');
  });
});

describe('parseShipHeroOrderFulfillment (pull)', () => {
  it('maps a generic-carrier shipment to shipped (close-out) with no tracking', () => {
    // BrandFox creates the generic-label shipment at CLOSE-OUT, after the
    // freight pickup — so a shipment means done, not "awaiting pickup".
    const snap = parseShipHeroOrderFulfillment({
      fulfillment_status: 'Tomorrow',
      shipments: [{ shipping_labels: { carrier: 'Wholesale Generic', shipping_method: 'genericlabel', tracking_number: 'X' } }],
    });
    expect(snap).toMatchObject({ status: 'shipped', trackingNumber: null });
  });

  it('maps packed order_history entries to ready_for_pickup', () => {
    const snap = parseShipHeroOrderFulfillment({
      fulfillment_status: 'Wholesale EDI',
      shipments: [],
      order_history: [
        { information: 'Order created from https://shipsfor.us' },
        { information: 'Order status updated to picking' },
        { information: 'Order status updated to packed' },
      ],
    });
    expect(snap.status).toBe('ready_for_pickup');
  });

  it('recognizes warehouse_completed as packed', () => {
    const snap = parseShipHeroOrderFulfillment({
      shipments: [],
      order_history: [{ information: 'Order status updated to warehouse_completed' }],
    });
    expect(snap.status).toBe('ready_for_pickup');
  });

  it('does not treat packing NOTES or the packing stage as packed', () => {
    const snap = parseShipHeroOrderFulfillment({
      fulfillment_status: 'QMS-Large',
      shipments: [],
      order_history: [
        { information: "We add the warehouse note 'SKUs require unboxing repacks with bubblewrap'" },
        { information: 'Reference Air Freight Packing Guidelines - packing slip necessary' },
        { information: 'Order status updated to packing' },
      ],
    });
    expect(snap.status).toBe('pending');
  });

  it('maps a real-carrier shipment to shipped with tracking', () => {
    const snap = parseShipHeroOrderFulfillment({
      shipments: [{ shipping_labels: [{ carrier: 'UPS', shipping_method: 'Ground', tracking_number: '1Z9', tracking_url: 'http://x' }] }],
    });
    expect(snap).toMatchObject({ status: 'shipped', trackingNumber: '1Z9', carrier: 'UPS', trackingUrl: 'http://x' });
  });

  it('reads cancellation from order-level status when there are no shipments', () => {
    expect(parseShipHeroOrderFulfillment({ fulfillment_status: 'canceled', shipments: [] }).status).toBe('cancelled');
  });

  it('defaults to pending with no shipments and a custom batch tag', () => {
    expect(parseShipHeroOrderFulfillment({ fulfillment_status: 'QMS-Large', shipments: [] }).status).toBe('pending');
  });
});

describe('parseShipHeroWebhook', () => {
  it('normalizes Order Packed Out to the ready signal', () => {
    const ev = parseShipHeroWebhook({
      webhook_type: 'Order Packed Out',
      order_number: 'SO-555',
      partner_order_id: 'uuid-123',
      order_id: 'OID-1',
    });
    expect(ev).toMatchObject({
      type: 'packed_out',
      status: 'ready_for_pickup',
      partnerOrderId: 'uuid-123',
      orderNumber: 'SO-555',
      externalOrderId: 'OID-1',
    });
  });

  it('normalizes a generic-label shipment to shipped (close-out) with no tracking', () => {
    const ev = parseShipHeroWebhook({
      webhook_type: 'Shipment Update',
      order_number: 'SO-555',
      partner_order_id: 'uuid-123',
      order_id: 'OID-1',
      shipping_carrier: 'Wholesale Generic',
      shipping_method: 'Wholesale Generic Label',
      tracking_number: 'IGNOREME',
    });
    expect(ev).toMatchObject({
      type: 'shipment_update',
      status: 'shipped',
      partnerOrderId: 'uuid-123',
      orderNumber: 'SO-555',
      externalOrderId: 'OID-1',
      trackingNumber: null,
    });
  });

  it('normalizes a real-carrier shipment to shipped with tracking', () => {
    const ev = parseShipHeroWebhook({
      webhook_type: 'Shipment Update',
      packages: [{ carrier: 'UPS', shipping_method: 'Ground', tracking_number: '1Z999' }],
    });
    expect(ev).toMatchObject({ type: 'shipment_update', status: 'shipped', trackingNumber: '1Z999', carrier: 'UPS' });
  });

  it('normalizes a cancellation', () => {
    const ev = parseShipHeroWebhook({ webhook_type: 'Order Canceled', order_number: 'SO-555' });
    expect(ev).toMatchObject({ type: 'order_cancelled', status: 'cancelled', orderNumber: 'SO-555' });
  });

  it('returns other/unknown for unrelated payloads', () => {
    expect(parseShipHeroWebhook({ webhook_type: 'Inventory Update' })?.type).toBe('other');
    expect(parseShipHeroWebhook(null)).toBeNull();
  });
});
