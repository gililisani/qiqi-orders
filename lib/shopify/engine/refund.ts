/**
 * L3 ENGINE — Loop C: Shopify refunds → NS Credit Memo + Customer Refund.
 *
 * Money chain per refund (owner rule: money returns to the SAME clearing
 * account it came from):
 *   Credit Memo (standalone; refunded lines at refunded amounts + tax
 *   reversal on the pass-through item + shipping refund) →
 *   Customer Refund transformed from the CM, account = gateway clearing.
 *
 * Keys: CM = SHOPCM-<refundId>, refund = SHOPRFD-<transactionId>.
 *
 * Inventory rule: a refund is money only. Refunded product lines always
 * book on the Refund Adjustment item (revenue reversal, no inventory, SKU
 * in the description) — never an inventory line, which would FORCE a
 * lot-level restock in NS. Stock follows the warehouse, not Shopify's
 * restock tick (2026-10-11): BrandFox's ShipHero shows no return
 * for any of 2026's nine "restocked" refunds on shipped orders (#7459:
 * both return requests declined, refund ticked restock). Goods that do
 * come back show up on the Inventory Check page (ShipHero above NetSuite)
 * and are corrected there. Residuals (shipping refunds, amount-only
 * refunds) also book on the adjustment item — one mechanism, CPA
 * re-points the account at will.
 */
import { centsToDecimal } from '../core/money';
import { storeDate } from '../core/dates';
import type { OrderPlan } from '../core/types';
import type { RefundPlan } from '../core/refundTransform';
import { PipelineError, type NsApi } from './pipeline';
import { gatewayAccountId, type EngineConfig } from './config';

export interface EnsureRefundsResult {
  nsCreditMemoIds: string[];
  nsRefundIds: string[];
  created: { creditMemos: number; refunds: number };
}

export async function ensureRefunds(
  refunds: RefundPlan[],
  orderPlan: OrderPlan,
  nsCustomerId: string,
  ns: NsApi,
  config: EngineConfig,
  opts: { orderHasNsFulfillment: boolean } = { orderHasNsFulfillment: false },
): Promise<EnsureRefundsResult> {
  const result: EnsureRefundsResult = {
    nsCreditMemoIds: [],
    nsRefundIds: [],
    created: { creditMemos: 0, refunds: 0 },
  };
  if (refunds.length === 0) return result;

  // Tax reversal target: which pass-through item did this order's tax use?
  const channelLiable = orderPlan.taxLines.some((t) => t.channelLiable);
  const taxItemId = channelLiable ? config.taxItems.channelLiable : config.taxItems.merchantLiable;

  const allSkus = refunds.flatMap((r) => r.lines.map((l) => l.sku!).filter(Boolean));
  const skuIds = allSkus.length ? await ns.resolveItemIdsBySku(allSkus) : new Map<string, string>();

  for (const refund of refunds) {
    const cmExtId = `SHOPCM-${refund.shopifyRefundId}`;
    let cmId = await ns.findRecordIdByExternalId('creditMemo', cmExtId);

    if (!cmId) {
      const lines: Array<Record<string, unknown>> = [];
      let taxCents = 0;
      for (const l of refund.lines) {
        // Shipped goods ticked "restock" in Shopify: say so on the line, so
        // the bookkeeper sees stock was deliberately not moved.
        const restockNote = l.restock && opts.orderHasNsFulfillment ? ' · restock ticked in Shopify, stock not moved' : '';
        lines.push({
          item: { id: config.refundAdjustmentItemId },
          quantity: l.quantity,
          price: { id: '-1' },
          rate: Math.round(l.subtotalCents / l.quantity) / 100,
          amount: Number(centsToDecimal(l.subtotalCents)),
          description: `Refund · ${l.sku ?? 'item'} ×${l.quantity}${restockNote}`,
        });
        taxCents += l.taxCents;
      }
      if (taxCents > 0) {
        if (!taxItemId) {
          throw new PipelineError({
            code: 'UNSUPPORTED_SOURCE',
            message: `${refund.orderName} refund: tax reversal needed but no pass-through tax item configured`,
          });
        }
        lines.push({
          item: { id: taxItemId },
          quantity: 1,
          price: { id: '-1' },
          rate: Number(centsToDecimal(taxCents)),
          amount: Number(centsToDecimal(taxCents)),
          description: 'Tax reversal',
        });
      }

      // Residual (shipping refunds + amount-only refunds) → adjustment
      // line. The description tells the bookkeeper what it was.
      if (refund.residualCents > 0) {
        const shippingCapCents = orderPlan.shipping?.amountCents ?? 0;
        const label =
          refund.residualCents <= shippingCapCents ? 'Refunded shipping' : 'Refund adjustment (amount-only)';
        lines.push({
          item: { id: config.refundAdjustmentItemId },
          quantity: 1,
          price: { id: '-1' },
          rate: Number(centsToDecimal(refund.residualCents)),
          amount: Number(centsToDecimal(refund.residualCents)),
          description: label,
        });
      }

      cmId = await ns.createRecord('creditMemo', {
        externalId: cmExtId,
        entity: { id: nsCustomerId },
        subsidiary: { id: config.subsidiaryId },
        // Sandbox demands a header location; prod NetScore money-only CMs
        // carry none (probed 2026-08-20) — configurable per target.
        ...(config.creditMemoLocationId ? { location: { id: config.creditMemoLocationId } } : {}),
        // Same searchable reference as the SO carries — global search on
        // the Shopify order number surfaces SO, invoice and CM together.
        // (True Related-Records linkage would require transforming the
        // invoice, which drags its inventory lines in and forces restock —
        // tested 2026-08-18, not viable for money-only CMs.)
        otherRefNum: refund.orderName,
        tranDate: storeDate(refund.createdAt),
        memo: `Shopify refund ${refund.orderName}${refund.note ? ` · ${refund.note}` : ''}`,
        item: { items: lines },
      });
      result.created.creditMemos += 1;
    }
    result.nsCreditMemoIds.push(cmId);

    // Money back through the same clearing account, one per gateway txn.
    for (const txn of refund.transactions) {
      const accountId = gatewayAccountId(config, txn.gateway);
      if (!accountId) {
        throw new PipelineError({
          code: 'UNSUPPORTED_SOURCE',
          message: `${refund.orderName} refund: no clearing account for gateway "${txn.gateway}"`,
        });
      }
      const rfdExtId = `SHOPRFD-${txn.shopifyTransactionId}`;
      let rfdId = await ns.findRecordIdByExternalId('customerrefund', rfdExtId);
      if (!rfdId) {
        rfdId = await ns.transformRecord('creditMemo', cmId, 'customerrefund', {
          externalId: rfdExtId,
          tranDate: storeDate(refund.createdAt),
          account: { id: accountId },
          memo: `Shopify refund ${refund.orderName} · ${txn.gateway}`,
        });
        result.created.refunds += 1;
      }
      result.nsRefundIds.push(rfdId);
    }
  }

  return result;
}
