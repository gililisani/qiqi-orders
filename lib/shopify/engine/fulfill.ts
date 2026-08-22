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
import { storeDate } from '../core/dates';
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

    // Map each fulfilled SKU to its SO line + FEFO-pick the lots.
    const skuIds = await ns.resolveItemIdsBySku(plan.lines.map((l) => l.sku!).filter(Boolean));
    // Lot tracking is per item: assemblies here carry lots, accessories
    // (e.g. TOL0006 Heat Cap, #6604/#6722) do not — a non-lot item gets a
    // plain stock check and NO inventory detail.
    const itemIdList = [...new Set(skuIds.values())];
    const lotFlags = itemIdList.length
      ? await ns.suiteQL<{ id: string; islotitem: string }>(`SELECT id, islotitem FROM item WHERE id IN (${itemIdList.join(',')})`)
      : [];
    const isLotItem = new Map(lotFlags.map((r) => [String(r.id), r.islotitem === 'T']));
    const picked: Array<{ orderLine: number; quantity: number; assignments: Array<Record<string, unknown>> }> = [];
    // The same SKU can appear on several Shopify lines (#6604: FPS0024 ×2 →
    // SO lines 5 and 6). Each SO line is consumed once; prefer the one with
    // the matching quantity so 1+2 never lands as 2 on the 1-unit line.
    const usedSoLines = new Set<number>();
    for (const line of plan.lines) {
      const itemId = line.sku ? skuIds.get(line.sku) : undefined;
      const free = soLines.filter((s) => s.itemId === itemId && !usedSoLines.has(s.lineId));
      const soLine = free.find((s) => s.quantity === line.quantity) ?? free[0];
      if (soLine) usedSoLines.add(soLine.lineId);
      if (!itemId || !soLine) {
        throw new PipelineError({
          code: 'UNKNOWN_SKU',
          message: `${plan.orderName} fulfillment ${plan.shopifyFulfillmentId}: SKU "${line.sku}" has no matching SO line`,
        });
      }
      const assignments = isLotItem.get(itemId)
        ? await fefoAssign(ns, itemId, line.quantity, config.fulfillmentLocationId, plan.orderName)
        : await assertPlainStock(ns, itemId, line.quantity, config.fulfillmentLocationId, plan.orderName);
      picked.push({ orderLine: soLine.lineId, quantity: line.quantity, assignments });
    }

    const tracking = plan.tracking
      .map((t) => [t.carrier, t.number].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(', ');
    const tranDate = storeDate(plan.createdAt);
    const memo = `Shopify ${plan.orderName}${tracking ? ` · ${tracking}` : ''}`;

    // Cross-subsidiary IFs can only be created via the SuiteScript RESTlet
    // (plain REST transform reports "no valid line item" across the
    // subsidiary boundary — proven live 2026-08-21). Same-subsidiary
    // (sandbox) keeps the plain transform.
    let ifId: string;
    if (ns.restletFulfillOrder && ns.restletFulfillConfigured?.()) {
      try {
        ifId = await ns.restletFulfillOrder({
          salesOrderId: nsSoId,
          externalId: extId,
          tranDate,
          memo,
          shipStatus: 'C',
          lines: picked.map((p) => ({
            orderLine: p.orderLine,
            quantity: p.quantity,
            locationId: config.fulfillmentLocationId,
            lots: p.assignments.map((a: any) => ({ id: String(a.issueInventoryNumber.id), quantity: Number(a.quantity) })),
          })),
        });
      } catch (err: any) {
        // Race guard: a concurrent poll/retry may have created this IF
        // between our ensure-lookup and the RESTlet save (seen live on
        // #7279, cron vs manual retry). The duplicate rejection means the
        // record EXISTS — adopt it instead of erroring.
        if (String(err?.message ?? '').includes('already exists')) {
          const raced = await ns.findRecordIdByExternalId('itemFulfillment', extId);
          if (raced) {
            nsFulfillmentIds.push(raced);
            continue;
          }
        }
        throw err;
      }
    } else {
      if (config.crossSubsidiaryFulfillment) {
        throw new PipelineError({
          code: 'UNSUPPORTED_SOURCE',
          message: `${plan.orderName}: cross-subsidiary fulfillment needs the fulfill RESTlet — deploy netsuite/restlet_fulfill_order.js and set NETSUITE_FULFILL_SCRIPT_ID/_DEPLOY_ID`,
        });
      }
      ifId = await ns.transformRecord('salesOrder', nsSoId, 'itemFulfillment', {
        externalId: extId,
        tranDate,
        shipStatus: { id: 'C' }, // Shipped
        memo,
        item: {
          items: picked.map((p) => ({
            orderLine: p.orderLine,
            quantity: p.quantity,
            location: { id: config.fulfillmentLocationId },
            ...(p.assignments.length ? { inventoryDetail: { inventoryAssignment: { items: p.assignments } } } : {}),
          })),
        },
      });
    }
    nsFulfillmentIds.push(ifId);
    created += 1;
  }

  return { nsFulfillmentIds, created };
}

/** Non-lot item: just prove the location has the stock; no inventory detail. */
async function assertPlainStock(
  ns: NsApi,
  itemId: string,
  needed: number,
  locationId: string,
  orderName: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = await ns.suiteQL<{ quantityavailable: string }>(
    `SELECT quantityavailable FROM aggregateitemlocation WHERE item = ${Number(itemId)} AND location = ${Number(locationId)}`,
  );
  const available = Number(rows[0]?.quantityavailable ?? 0);
  if (available < needed) {
    throw new PipelineError({
      code: 'UNSUPPORTED_SOURCE',
      message: `${orderName}: insufficient stock for item ${itemId} at location ${locationId} (need ${needed}, available ${available})`,
    });
  }
  return [];
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
