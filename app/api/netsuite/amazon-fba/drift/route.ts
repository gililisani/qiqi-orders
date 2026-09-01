import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../../lib/netsuite';
import { getFbaInventory, isAmazonSpConfigured, normalizeSellerSku } from '../../../../../lib/amazonSp/client';
import { resolveSkuList } from '../../../../../lib/amazonFba/buildFromAmazon';

export const maxDuration = 120;

export interface DriftRow {
  sku: string; // normalized seller SKU, or NS itemid for NS-only rows
  nsItemId: string | null;
  itemName: string;
  nsQty: number;
  amazonFulfillable: number;
  amazonReserved: number;
  amazonInbound: number;
  amazonUnsellable: number;
  /** fulfillable + reserved + inbound — the units NetSuite should carry. */
  amazonSellableTotal: number;
  /** amazonSellableTotal − nsQty. Positive: NS is missing stock (unrecorded inbound / returns). */
  delta: number;
  note: 'ok' | 'ns-missing-stock' | 'ns-phantom-stock' | 'unmapped-amazon-sku';
}

/**
 * GET — NetSuite's Amazon-FBA-location book stock vs Amazon's live inventory,
 * per SKU. The early-warning panel for exactly the failures we hit on
 * 2026-09-01: unrecorded inbound shipments and never-restocked returns.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    if (!isAmazonSpConfigured()) {
      return NextResponse.json({ error: 'Amazon SP-API is not configured.' }, { status: 400 });
    }
    const supabaseAdmin = createServiceRoleClient();
    const { data: config } = await supabaseAdmin
      .from('amazon_fba_config')
      .select('location_ns_id')
      .eq('id', 1)
      .maybeSingle();
    if (!config?.location_ns_id) {
      return NextResponse.json({ error: 'Amazon FBA location is not configured.' }, { status: 400 });
    }

    const ns = createNetSuiteAPI();
    const [inventory, nsRows] = await Promise.all([
      getFbaInventory(),
      ns.suiteQL<{ item: string; itemid: string; displayname: string; qty: string }>(
        `SELECT ib.item, i.itemid, i.displayname, SUM(NVL(ib.quantityavailable, 0)) AS qty
           FROM InventoryBalance ib
           JOIN item i ON i.id = ib.item
          WHERE ib.location = ${Number(config.location_ns_id)}
          GROUP BY ib.item, i.itemid, i.displayname`
      ),
    ]);

    // Amazon side: one row per seller SKU (the API repeats SKUs across stores).
    const bySku = new Map<string, (typeof inventory)[number]>();
    for (const s of inventory) {
      const raw = (s as any).sellerSku || '';
      if (!raw || bySku.has(raw)) continue;
      bySku.set(raw, s);
    }
    const skuMap = await resolveSkuList([...bySku.keys()], supabaseAdmin, ns);

    const nsById = new Map(nsRows.map((r) => [String(r.item), r]));
    const rows: DriftRow[] = [];
    const coveredNsIds = new Set<string>();

    for (const [rawSku, s] of bySku) {
      const d: any = (s as any).inventoryDetails || {};
      const fulfillable = Number(d.fulfillableQuantity) || 0;
      const reserved = Number(d.reservedQuantity?.totalReservedQuantity) || 0;
      const inbound =
        (Number(d.inboundWorkingQuantity) || 0) +
        (Number(d.inboundShippedQuantity) || 0) +
        (Number(d.inboundReceivingQuantity) || 0);
      const unsellable = Number(d.unfulfillableQuantity?.totalUnfulfillableQuantity) || 0;
      const sellableTotal = fulfillable + reserved + inbound;

      const resolved = skuMap.get(rawSku) || null;
      const nsRow = resolved ? nsById.get(String(resolved.nsItemId)) : undefined;
      const nsQty = nsRow ? Math.round(Number(nsRow.qty) || 0) : 0;
      if (resolved) coveredNsIds.add(String(resolved.nsItemId));

      // Skip SKUs that are dead on both sides — the table stays readable.
      if (sellableTotal === 0 && unsellable === 0 && nsQty === 0) continue;

      const delta = sellableTotal - nsQty;
      rows.push({
        sku: normalizeSellerSku(rawSku),
        nsItemId: resolved?.nsItemId ?? null,
        itemName: resolved?.nsItemName || (s as any).productName?.slice(0, 60) || rawSku,
        nsQty,
        amazonFulfillable: fulfillable,
        amazonReserved: reserved,
        amazonInbound: inbound,
        amazonUnsellable: unsellable,
        amazonSellableTotal: sellableTotal,
        delta,
        note: !resolved
          ? 'unmapped-amazon-sku'
          : delta > 0
            ? 'ns-missing-stock'
            : delta < 0
              ? 'ns-phantom-stock'
              : 'ok',
      });
    }

    // NetSuite items with stock at the FBA location that Amazon doesn't list
    // (delisted products — e.g. the FPS0016 phantom 193).
    for (const r of nsRows) {
      if (coveredNsIds.has(String(r.item))) continue;
      const nsQty = Math.round(Number(r.qty) || 0);
      if (nsQty === 0) continue;
      rows.push({
        sku: r.itemid,
        nsItemId: String(r.item),
        itemName: r.displayname || r.itemid,
        nsQty,
        amazonFulfillable: 0,
        amazonReserved: 0,
        amazonInbound: 0,
        amazonUnsellable: 0,
        amazonSellableTotal: 0,
        delta: -nsQty,
        note: 'ns-phantom-stock',
      });
    }

    rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.sku.localeCompare(b.sku));
    return NextResponse.json({ generatedAt: new Date().toISOString(), rows });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Amazon FBA drift error:', error);
    return NextResponse.json({ error: error.message || 'Drift check failed.' }, { status: 500 });
  }
}
