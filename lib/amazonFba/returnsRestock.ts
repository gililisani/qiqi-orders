/**
 * Physical FBA customer returns → NetSuite restock.
 *
 * A refund and a physical return are different events: many refunds never come
 * back, and returned units arrive weeks later, graded by Amazon on arrival.
 * The monthly Cash Refund books the MONEY (always); this module books the
 * UNITS — only those Amazon physically put back into sellable stock:
 *
 *   SELLABLE + "Unit returned to inventory"  → inventory adjustment at the
 *                                              Amazon FBA location (restock)
 *   CUSTOMER_DAMAGED / DEFECTIVE / EXPIRED…  → no restock (Amazon holds them
 *                                              as unsellable and disposes)
 *
 * Data source: GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA, keyed by RETURN
 * date — so a January refund whose unit arrives back in February restocks in
 * February's batch, when the unit actually reappeared in the warehouse.
 *
 * History note: returns before 2026-09 were trued up manually in one
 * adjustment (owner, 2026-09-01) — automation owns September 2026 onward.
 */

import {
  createReport,
  getReportStatus,
  downloadReportRows,
  normalizeSellerSku,
} from '../amazonSp/client';
import type { SkuResolution } from './buildFromAmazon';

export interface ReturnUnit {
  returnDate: string; // YYYY-MM-DD
  orderId: string;
  sellerSku: string;
  nsItemId: string | null;
  nsItemName: string | null;
  quantity: number;
  disposition: string; // SELLABLE | CUSTOMER_DAMAGED | DEFECTIVE | ...
  status: string; // "Unit returned to inventory" | ...
  reason: string;
  restock: boolean;
}

export interface RestockLine {
  nsItemId: string;
  nsItemName: string;
  quantity: number;
  orderIds: string[];
}

export interface MonthReturns {
  units: ReturnUnit[];
  /** Restockable units aggregated per NetSuite item — becomes the adjustment. */
  restockLines: RestockLine[];
  restockUnits: number;
  nonRestockUnits: number;
  /** Returned seller SKUs with no NetSuite mapping (restock skipped, surfaced in UI). */
  unresolvedSkus: string[];
}

/** A unit is restockable only when Amazon graded it sellable AND put it back. */
export function isRestockable(disposition: string, status: string): boolean {
  return /^SELLABLE$/i.test((disposition || '').trim()) && /returned to inventory/i.test(status || '');
}

/** Pure transform: raw returns-report rows + SKU map → MonthReturns. Unit tested. */
export function classifyMonthReturns(
  rows: Record<string, string>[],
  skuMap: Map<string, SkuResolution> // keyed by RAW seller SKU
): MonthReturns {
  const units: ReturnUnit[] = [];
  const unresolved = new Set<string>();

  for (const row of rows) {
    const sellerSku = (row['sku'] || '').trim();
    const disposition = (row['detailed-disposition'] || '').trim();
    const status = (row['status'] || '').trim();
    const quantity = parseInt(row['quantity'] || '1', 10) || 1;
    const resolved = skuMap.get(sellerSku) || skuMap.get(normalizeSellerSku(sellerSku)) || null;
    const restock = isRestockable(disposition, status) && !!resolved;
    if (isRestockable(disposition, status) && !resolved && sellerSku) unresolved.add(sellerSku);
    units.push({
      returnDate: (row['return-date'] || '').slice(0, 10),
      orderId: (row['order-id'] || '').trim(),
      sellerSku,
      nsItemId: resolved?.nsItemId ?? null,
      nsItemName: resolved?.nsItemName ?? null,
      quantity,
      disposition,
      status,
      reason: (row['reason'] || '').trim(),
      restock,
    });
  }

  const byItem = new Map<string, RestockLine>();
  for (const u of units) {
    if (!u.restock || !u.nsItemId) continue;
    const line = byItem.get(u.nsItemId) || {
      nsItemId: u.nsItemId,
      nsItemName: u.nsItemName || u.sellerSku,
      quantity: 0,
      orderIds: [],
    };
    line.quantity += u.quantity;
    if (u.orderId) line.orderIds.push(u.orderId);
    byItem.set(u.nsItemId, line);
  }

  const restockUnits = [...byItem.values()].reduce((s, l) => s + l.quantity, 0);
  return {
    units,
    restockLines: [...byItem.values()],
    restockUnits,
    nonRestockUnits: units.reduce((s, u) => s + u.quantity, 0) - restockUnits,
    unresolvedSkus: [...unresolved],
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch the raw customer-returns rows for one calendar month (by return date).
 * Amazon generates the report async; CANCELLED means no data in the window.
 */
export async function fetchMonthReturnRows(
  period: string, // YYYY-MM
  // 15 × 10s ≈ 2.5 min — fits the 300s route budget alongside the Finances
  // fetch; a timeout degrades to a money-only preview (returnsError), and
  // re-fetching the month retries.
  { pollMs = 10_000, maxPolls = 15 }: { pollMs?: number; maxPolls?: number } = {}
): Promise<Record<string, string>[]> {
  const [yearStr, monthStr] = period.split('-');
  const lastDay = new Date(Date.UTC(Number(yearStr), Number(monthStr), 0)).getUTCDate();
  const reportId = await createReport(
    'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA',
    `${period}-01T00:00:00Z`,
    `${period}-${String(lastDay).padStart(2, '0')}T23:59:59Z`
  );
  for (let i = 0; i < maxPolls; i++) {
    const st = await getReportStatus(reportId);
    if (st.processingStatus === 'DONE' && st.reportDocumentId) {
      return downloadReportRows(st.reportDocumentId);
    }
    if (st.processingStatus === 'CANCELLED') return []; // no returns that month
    if (st.processingStatus === 'FATAL') {
      throw new Error(`Amazon returns report failed (FATAL) for ${period}.`);
    }
    await sleep(pollMs);
  }
  throw new Error(`Amazon returns report for ${period} did not finish in time.`);
}

/** Seller SKUs appearing in returns rows (raw, for the resolver). */
export function returnRowSkus(rows: Record<string, string>[]): string[] {
  return [...new Set(rows.map((r) => (r['sku'] || '').trim()).filter(Boolean))];
}
