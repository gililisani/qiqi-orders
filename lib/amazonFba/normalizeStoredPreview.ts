/**
 * Batch payloads come in two historical shapes: a full MonthPreview (stored
 * by prepare) or the slimmer MonthPushInput (stored by the push route while
 * pushing). Rendering must survive both — this rebuilds any missing derived
 * fields so a failed batch still shows as a complete month card.
 */

import type { MonthPreview } from './parseReport';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function normalizeStoredPreview(payload: any): MonthPreview | null {
  if (!payload || typeof payload.period !== 'string' || !Array.isArray(payload.saleLines)) {
    return null;
  }
  const saleLines = payload.saleLines;
  const feeLines = Array.isArray(payload.feeLines) ? payload.feeLines : [];
  const grossSales =
    payload.grossSales ?? round2(saleLines.reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0));
  const feeTotal =
    payload.feeTotal ?? round2(feeLines.reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0));
  const discountTotal = Number(payload.discountTotal) || 0;
  const refundTotal = Number(payload.refundTotal) || 0;
  const reimbursementTotal = Number(payload.reimbursementTotal) || 0;
  const needsAttention = Array.isArray(payload.needsAttention) ? payload.needsAttention : [];
  const net = round2(grossSales + discountTotal + refundTotal - feeTotal + reimbursementTotal);

  return {
    period: payload.period,
    periodLabel: payload.periodLabel || payload.period,
    tranDate: payload.tranDate || `${payload.period}-28`,
    saleLines,
    grossSales,
    discountTotal,
    orderCount: payload.orderCount ?? new Set(saleLines.map((l: any) => l.orderId)).size,
    refundTotal,
    refundCount: payload.refundCount ?? (refundTotal !== 0 ? 1 : 0),
    feeLines,
    feeTotal,
    reimbursementTotal,
    needsAttention,
    skippedBalanceRows: payload.skippedBalanceRows || 0,
    reportNet: payload.reportNet ?? net,
    computedNet: payload.computedNet ?? net,
    reconciles: payload.reconciles ?? needsAttention.length === 0,
  };
}
