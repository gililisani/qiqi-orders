/**
 * Applies the admin's manual fixes to a parsed month preview:
 *  - "needs attention" order rows resolved into explicit sale lines
 *    (lines must sum exactly to the row's product charge), or
 *  - unknown-type rows acknowledged/ignored (their report total stays in the
 *    reconciliation math — ignoring accepts, it doesn't hide).
 * Pure function: returns a new preview, never mutates the input.
 */

import type { MonthPreview, SaleLine } from './parseReport';

export interface ManualLine {
  nsItemId: string;
  nsItemName: string;
  quantity: number;
  unitPrice: number;
}

export interface RowResolution {
  /** Index into preview.needsAttention (as parsed). */
  attentionIndex: number;
  /** Explicit lines for order rows… */
  lines?: ManualLine[];
  /** …or acknowledge an unknown-type row without booking anything. */
  ignored?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function applyResolutions(
  preview: MonthPreview,
  resolutions: RowResolution[]
): { preview: MonthPreview; errors: string[] } {
  const errors: string[] = [];
  const byIndex = new Map(resolutions.map((r) => [r.attentionIndex, r]));

  const extraLines: SaleLine[] = [];
  const remainingAttention: MonthPreview['needsAttention'] = [];

  // Stored batch payloads can be slimmer than a fresh parse — never assume.
  (preview.needsAttention || []).forEach((attention, index) => {
    const resolution = byIndex.get(index);
    if (!resolution) {
      remainingAttention.push(attention);
      return;
    }
    if (resolution.ignored) {
      if (attention.reason !== 'unknown-type') {
        errors.push(`Row for order ${attention.row.orderId || '—'} is a sale and cannot be ignored — assign items instead.`);
        remainingAttention.push(attention);
      }
      return; // acknowledged: removed from blocking, total stays in the math
    }
    const lines = resolution.lines || [];
    if (lines.length === 0) {
      remainingAttention.push(attention);
      return;
    }
    const sum = round2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
    if (Math.abs(sum - attention.row.productCharges) > 0.005) {
      errors.push(
        `Lines for order ${attention.row.orderId} sum to $${sum.toFixed(2)} but the row charge is $${attention.row.productCharges.toFixed(2)}.`
      );
      remainingAttention.push(attention);
      return;
    }
    for (const line of lines) {
      if (!line.nsItemId || !Number.isInteger(line.quantity) || line.quantity <= 0 || line.unitPrice <= 0) {
        errors.push(`Invalid manual line for order ${attention.row.orderId}.`);
      }
    }
    extraLines.push(
      ...lines.map((l) => ({
        orderId: attention.row.orderId,
        amazonName: attention.row.product,
        nsItemId: l.nsItemId,
        nsItemName: l.nsItemName,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        amount: round2(l.quantity * l.unitPrice),
      }))
    );
  });

  const saleLines = [...(preview.saleLines || []), ...extraLines];
  const grossSales = round2(preview.grossSales + extraLines.reduce((s, l) => s + l.amount, 0));

  // Same reconciliation formula as the parser, over the updated state:
  // unresolved order-type rows contribute their raw charge; ALL unknown-type
  // rows (ignored or not) contribute their report total.
  const unresolvedSalesPortion = remainingAttention
    .filter((a) => a.reason !== 'unknown-type')
    .reduce((s, a) => s + a.row.productCharges, 0);
  const unknownTotals = (preview.needsAttention || [])
    .filter((a) => a.reason === 'unknown-type')
    .reduce((s, a) => s + a.row.total, 0);
  const computedNet = round2(
    grossSales +
      unresolvedSalesPortion +
      preview.discountTotal +
      preview.refundTotal -
      preview.feeTotal +
      preview.reimbursementTotal +
      unknownTotals
  );

  const next: MonthPreview = {
    ...preview,
    saleLines,
    grossSales,
    needsAttention: remainingAttention,
    computedNet,
    reconciles:
      remainingAttention.length === 0 &&
      errors.length === 0 &&
      Math.abs(computedNet - preview.reportNet) < 0.01,
  };
  return { preview: next, errors };
}
