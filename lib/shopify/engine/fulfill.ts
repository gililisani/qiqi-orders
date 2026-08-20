/**
 * L3 ENGINE — Loop B: Shopify fulfillments → NS Item Fulfillments.
 *
 * One IF per Shopify fulfillment (partial shipments = several IFs), keyed
 * SHOPFUL-<fulfillmentId>. Lots are assigned FEFO: expiration date when
 * present, else lowest lot number (this account leaves expirationdate
 * empty; lot numbers encode production order). Insufficient lot stock at
 * the fulfillment location parks the order loudly — never a fake IF.
 */
import { PipelineError, type NsApi } from './pipeline';
import type { EngineConfig } from './config';
import type { FulfillmentPlan } from '../core/fulfillmentTransform';

export interface FulfillConfig extends EngineConfig {
  /** Location the 3PL ships from (sandbox: 31 "Packable - Qiqi INC"; re-verify prod). */
  fulfillmentLocationId: string;
}

interface SoLine {
  lineId: number;
  itemId: string;
  quantity: number;
  itemType: string;
}

export interface EnsureFulfillmentsResult {
  nsFulfillmentIds: string[];
  created: number;
}

export async function ensureItemFulfillments(
  plans: FulfillmentPlan[],
  nsSoId: string,
  ns: NsApi,
  config: FulfillConfig,
): Promise<EnsureFulfillmentsResult> {
  if (plans.length === 0) return { nsFulfillmentIds: [], created: 0 };

  const nsFulfillmentIds: string[] = [];
  let created = 0;

  // SO lines (inventory only — tax/shipping never fulfill).
  const soLines = (
    await ns.suiteQL<{ id: string; item: string; quantity: string; itemtype: string }>(
      `SELECT id, item, quantity, itemtype FROM transactionline
        WHERE transaction = ${Number(nsSoId)} AND mainline = 'F' AND taxline = 'F'
          AND itemtype IN ('InvtPart', 'Assembly', 'Kit')`,
    )
  ).map<SoLine>((r) => ({
    lineId: Number(r.id),
    itemId: String(r.item),
    quantity: Math.abs(Number(r.quantity)),
    itemType: r.itemtype,
  }));

  for (const plan of plans) {
    const extId = `SHOPFUL-${plan.shopifyFulfillmentId}`;
    const existing = await ns.findRecordIdByExternalId('itemFulfillment', extId);
    if (existing) {
      nsFulfillmentIds.push(existing);
      continue;
    }

    // Map each fulfilled SKU to its SO line.
    const skuIds = await ns.resolveItemIdsBySku(plan.lines.map((l) => l.sku!).filter(Boolean));
    const ifLines: Array<Record<string, unknown>> = [];
    for (const line of plan.lines) {
      const itemId = line.sku ? skuIds.get(line.sku) : undefined;
      const soLine = soLines.find((s) => s.itemId === itemId);
      if (!itemId || !soLine) {
        throw new PipelineError({
          code: 'UNKNOWN_SKU',
          message: `${plan.orderName} fulfillment ${plan.shopifyFulfillmentId}: SKU "${line.sku}" has no matching SO line`,
        });
      }
      const assignments = await fefoAssign(ns, itemId, line.quantity, config.fulfillmentLocationId, plan.orderName);
      ifLines.push({
        orderLine: soLine.lineId,
        quantity: line.quantity,
        location: { id: config.fulfillmentLocationId },
        inventoryDetail: { inventoryAssignment: { items: assignments } },
      });
    }

    const tracking = plan.tracking
      .map((t) => [t.carrier, t.number].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(', ');

    const ifId = await ns.transformRecord('salesOrder', nsSoId, 'itemFulfillment', {
      externalId: extId,
      tranDate: plan.createdAt.slice(0, 10),
      shipStatus: { id: 'C' }, // Shipped
      memo: `Shopify ${plan.orderName}${tracking ? ` · ${tracking}` : ''}`,
      item: { items: ifLines },
    });
    nsFulfillmentIds.push(ifId);
    created += 1;
  }

  return { nsFulfillmentIds, created };
}

/** FEFO: expiration first when present, else lowest lot number. May span lots. */
async function fefoAssign(
  ns: NsApi,
  itemId: string,
  needed: number,
  locationId: string,
  orderName: string,
): Promise<Array<Record<string, unknown>>> {
  const lots = await ns.suiteQL<{ id: string; inventorynumber: string; quantityavailable: string; expirationdate: string | null }>(
    `SELECT inv.id, inv.inventorynumber, inv.expirationdate, bal.quantityavailable
       FROM inventorynumber inv
       JOIN inventorynumberlocation bal ON bal.inventorynumber = inv.id
      WHERE inv.item = ${Number(itemId)} AND bal.location = ${Number(locationId)}
        AND bal.quantityavailable > 0
      ORDER BY inv.expirationdate ASC NULLS LAST, inv.inventorynumber ASC`,
  );
  const assignments: Array<Record<string, unknown>> = [];
  let remaining = needed;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(lot.quantityavailable));
    assignments.push({ issueInventoryNumber: { id: lot.id }, quantity: take });
    remaining -= take;
  }
  if (remaining > 0) {
    throw new PipelineError({
      code: 'UNSUPPORTED_SOURCE',
      message: `${orderName}: insufficient lot stock for item ${itemId} at location ${locationId} (need ${needed}, short ${remaining})`,
    });
  }
  return assignments;
}
