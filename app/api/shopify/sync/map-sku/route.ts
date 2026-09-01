import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../../lib/shopify/store';
import { fetchOrderById, retryOrder } from '../../../../../lib/shopify/engine/retryOrder';
import { createNetSuiteForTarget } from '../../../../../lib/shopify/engine/nsTarget';

/**
 * Permanent SKU alias: map a Shopify SKU to an NS item once; every future
 * order with it resolves automatically. Accepts the NS item's internal id
 * OR its item code (looked up).
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'shopify:edit');
    const { shopifySku, nsItem, retryShopifyOrderId } = await request.json();
    if (!shopifySku || !nsItem) {
      return NextResponse.json({ error: 'shopifySku and nsItem are required' }, { status: 400 });
    }
    const store = new ShopifySyncStore(createServiceRoleClient());
    const config = await store.getConfig();
    if (config.mode !== 'sandbox' && config.mode !== 'live') {
      return NextResponse.json({ error: `Sync mode is '${config.mode}'` }, { status: 409 });
    }
    const ns = createNetSuiteForTarget(config.mode === 'live' ? 'production' : 'sandbox');

    const esc = String(nsItem).replace(/'/g, "''");
    const rows = /^\d+$/.test(String(nsItem))
      ? await ns.suiteQL<{ id: string; itemid: string }>(`SELECT id, itemid FROM item WHERE id = ${Number(nsItem)}`)
      : await ns.suiteQL<{ id: string; itemid: string }>(`SELECT id, itemid FROM item WHERE itemid = '${esc}'`);
    if (!rows.length) return NextResponse.json({ error: `NS item "${nsItem}" not found` }, { status: 404 });

    await store.addSkuAlias(String(shopifySku), String(rows[0].id), `mapped via dashboard → ${rows[0].itemid}`);
    await store.event('system', 'sku_mapped', null, { shopifySku, nsItemId: rows[0].id, nsItemCode: rows[0].itemid });

    if (retryShopifyOrderId && /^\d+$/.test(String(retryShopifyOrderId))) {
      const order = await fetchOrderById(String(retryShopifyOrderId));
      if (order) return NextResponse.json({ mapped: rows[0].itemid, ...(await retryOrder(order, store)) });
    }
    return NextResponse.json({ mapped: rows[0].itemid, result: 'mapped' });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
