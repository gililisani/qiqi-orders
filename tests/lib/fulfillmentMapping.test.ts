import { describe, it, expect } from 'vitest';
import { buildNormalizedOrder, splitContactName } from '@/lib/fulfillment/normalize';
import {
  isPickupShipment,
  buildShipHeroOrderInput,
  parseShipHeroWebhook,
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
    expect(n.lineItems[0]).toMatchObject({ sku: 'SKU-A', quantity: 2, unitPrice: 12.5, partnerLineItemId: 'li-1' });
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

  it('drops line items with no SKU', () => {
    const n = buildNormalizedOrder({
      ...hubOrder,
      items: [{ id: 'li-1', quantity: 1, unit_price: 1, product: { sku: null } }, ...hubOrder.items],
    });
    expect(n.lineItems).toHaveLength(2);
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

describe('buildShipHeroOrderInput', () => {
  it('produces a valid create input scoped to the customer account', () => {
    const input = buildShipHeroOrderInput(buildNormalizedOrder(hubOrder), cfg());
    expect(input.order_number).toBe('SO-555');
    expect(input.partner_order_id).toBe('uuid-123');
    expect(input.customer_account_id).toBe('97016');
    expect(input.shipping_address.city).toBe('Phoenix');
    expect(input.shipping_address.first_name).toBe('Jane');
    expect(input.line_items[0]).toMatchObject({ sku: 'SKU-A', quantity: 2, price: '12.50', partner_line_item_id: 'li-1' });
  });

  it('omits customer_account_id when not configured', () => {
    const input = buildShipHeroOrderInput(buildNormalizedOrder(hubOrder), cfg({ customerAccountId: null }));
    expect(input.customer_account_id).toBeUndefined();
  });

  it('pins line-item warehouse_id only when configured', () => {
    const without = buildShipHeroOrderInput(buildNormalizedOrder(hubOrder), cfg());
    expect(without.line_items[0].warehouse_id).toBeUndefined();
    const withWh = buildShipHeroOrderInput(buildNormalizedOrder(hubOrder), cfg({ warehouseId: 'V2FyZWhvdXNlOjgxODkz' }));
    expect(withWh.line_items[0].warehouse_id).toBe('V2FyZWhvdXNlOjgxODkz');
  });
});

describe('parseShipHeroWebhook', () => {
  it('normalizes a generic/pickup shipment to ready_for_pickup with no tracking', () => {
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
      status: 'ready_for_pickup',
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
