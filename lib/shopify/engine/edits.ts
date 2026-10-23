/**
 * L3 ENGINE — order edits after booking, and closing lines that will never
 * ship. Planning is pure (core/orderEdits.ts); these are the NetSuite steps.
 *
 * Runs between Loop A and Loop B (the shipment needs the added lines on the
 * SO), and the line closing runs last (after the shipment booked what did
 * ship). Every step is an ensure: re-running after a partial failure adds,
 * bills or closes nothing twice.
 */
import { centsToDecimal } from '../core/money';
import { storeDate } from '../core/dates';
import {
  editNeedsReview,
  planAddedLines,
  planEditInvoice,
  planLineClosures,
  shopifyLineStates,
  type SoLineState,
} from '../core/orderEdits';
import type { OrderPlan, ShopifyOrder } from '../core/types';
import type { RefundPlan } from '../core/refundTransform';
import { PipelineError, type NsApi } from './pipeline';
import type { EngineConfig } from './config';

export async function readSoLines(ns: NsApi, nsSoId: string): Promise<SoLineState[]> {
  // Every product line (stock or not) — counting only stock lines would make
  // a non-stock product look "added after booking" and bill it twice.
  const rows = await ns.suiteQL<any>(
    `SELECT id, item, itemtype, quantity, quantitybilled, quantityshiprecv, isclosed FROM transactionline
      WHERE transaction = ${Number(nsSoId)} AND mainline = 'F' AND taxline = 'F'
        AND itemtype IN ('InvtPart', 'Assembly', 'Kit', 'NonInvtPart', 'Service', 'OthCharge')`,
  );
  return rows.map((r) => ({
    lineId: Number(r.id),
    itemId: String(r.item),
    itemType: r.itemtype ? String(r.itemtype) : undefined,
    quantity: Math.abs(Number(r.quantity) || 0),
    quantityBilled: Math.abs(Number(r.quantitybilled) || 0),
    quantityFulfilled: Math.abs(Number(r.quantityshiprecv) || 0),
    isClosed: r.isclosed === 'T',
  }));
}

async function itemMaps(ns: NsApi, plan: OrderPlan, skuOverrides?: Map<string, string>) {
  const itemIdBySku = await ns.resolveItemIdsBySku([...new Set(plan.lines.map((l) => l.sku))]);
  for (const [sku, id] of skuOverrides ?? []) itemIdBySku.set(sku, id);
  const skuByItemId = new Map([...itemIdBySku].map(([sku, id]) => [id, sku]));
  return { itemIdBySku, skuByItemId };
}

export interface EditResult {
  addedLines: number;
  editInvoiceIds: string[];
}

/** Book items added to the order after the SO was created. */
export async function ensureOrderEdits(
  order: ShopifyOrder,
  plan: OrderPlan,
  refunds: RefundPlan[],
  nsSoId: string,
  ns: NsApi,
  config: EngineConfig,
  opts: { skuOverrides?: Map<string, string> } = {},
): Promise<EditResult> {
  const result: EditResult = { addedLines: 0, editInvoiceIds: [] };
  const lines = shopifyLineStates(order, plan);
  const { itemIdBySku, skuByItemId } = await itemMaps(ns, plan, opts.skuOverrides);
  let soLines = await readSoLines(ns, nsSoId);
  const added = planAddedLines(lines, soLines, itemIdBySku);

  const review = editNeedsReview(plan, refunds, added);
  if (review) throw new PipelineError({ code: 'ORDER_EDIT_NEEDS_REVIEW', message: review });

  if (added.length) {
    // No line key → NetSuite appends the line (existing lines untouched).
    await ns.updateRecord('salesOrder', nsSoId, {
      item: {
        items: added.map((a) => ({
          item: { id: a.itemId },
          quantity: a.quantity,
          price: { id: '-1' },
          rate: Math.round(a.amountCents / a.quantity) / 100,
          amount: Number(centsToDecimal(a.amountCents)),
          description: a.description,
          ...(config.crossSubsidiaryFulfillment ? { inventorylocation: { id: config.fulfillmentLocationId } } : {}),
        })),
      },
    });
    result.addedLines = added.length;
    soLines = await readSoLines(ns, nsSoId);
  }

  const inv = planEditInvoice(lines, soLines, skuByItemId);
  if (inv) {
    const extId = `SHOPINVE-${plan.shopifyOrderId}-${inv.lineIds[0]}`;
    let invId = await ns.findRecordIdByExternalId('invoice', extId);
    if (!invId) {
      const taxLines = inv.taxLines.map((t) => ({
        item: { id: (t.channelLiable ? config.taxItems.channelLiable : config.taxItems.merchantLiable)! },
        quantity: 1,
        price: { id: '-1' },
        rate: Number(centsToDecimal(t.amountCents)),
        amount: Number(centsToDecimal(t.amountCents)),
        description: t.title,
      }));
      const editDate = refunds.filter((r) => r.kind === 'removal').map((r) => r.createdAt).sort().pop();
      invId = await ns.transformRecord('salesOrder', nsSoId, 'invoice', {
        externalId: extId,
        tranDate: storeDate(editDate ?? new Date().toISOString()),
        terms: { id: config.termsId },
        memo: `Shopify ${plan.orderName} · order edit`,
        // Shipping was billed on the original invoice — never again here.
        shippingCost: 0,
        ...(taxLines.length ? { item: { items: taxLines } } : {}),
        // Always explicit: the transform would otherwise copy the SO's
        // header discount (as a percentage) onto the added lines.
        discountItem: { id: config.discountItemId },
        discountRate: Number(centsToDecimal(-inv.discountCents)),
      });
    }
    const [row] = await ns.suiteQL<{ foreigntotal: string }>(`SELECT foreigntotal FROM transaction WHERE id = ${Number(invId)}`);
    const got = Math.round(Math.abs(Number(row?.foreigntotal ?? 0)) * 100);
    if (got !== inv.expectedCents) {
      throw new PipelineError({
        code: 'ORDER_EDIT_NEEDS_REVIEW',
        message: `${plan.orderName}: order-edit invoice ${invId} totals $${(got / 100).toFixed(2)}, expected $${(inv.expectedCents / 100).toFixed(2)} — check it in NetSuite`,
      });
    }
    result.editInvoiceIds.push(invId);
  }
  return result;
}

/** Close SO lines whose units will never ship (removed, cancelled). Returns the closed line ids. */
export async function closeUnshippableLines(
  order: ShopifyOrder,
  plan: OrderPlan,
  nsSoId: string,
  ns: NsApi,
  opts: { skuOverrides?: Map<string, string> } = {},
): Promise<number[]> {
  const lines = shopifyLineStates(order, plan);
  const { skuByItemId } = await itemMaps(ns, plan, opts.skuOverrides);
  const shipped = new Map<string, number>();
  for (const f of order.fulfillments.filter((x) => x.status === 'SUCCESS')) {
    for (const n of f.fulfillmentLineItems.nodes) {
      if (n.lineItem.sku) shipped.set(n.lineItem.sku, (shipped.get(n.lineItem.sku) ?? 0) + n.quantity);
    }
  }
  const close = planLineClosures(lines, await readSoLines(ns, nsSoId), shipped, skuByItemId);
  if (close.length) {
    await ns.updateRecord('salesOrder', nsSoId, { item: { items: close.map((line) => ({ line, isClosed: true })) } });
  }
  return close;
}
