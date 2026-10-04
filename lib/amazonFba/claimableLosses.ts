/**
 * FBA claimable losses — catches warehouse lost/damaged units Amazon has
 * NOT made whole, inside the 60-day reimbursement claim window (owner
 * request 2026-10-03, replacing the monthly-cadence Stock Drift panel
 * which couldn't beat the window).
 *
 * Sources (both via the existing SP-API Reports plumbing):
 *  - GET_LEDGER_DETAIL_VIEW_DATA — Amazon's own inventory event log
 *    (adjustments: lost / damaged / found, per SKU per day, ~1-2d lag)
 *  - GET_FBA_REIMBURSEMENTS_DATA — what Amazon already paid back
 *
 * Model: per SKU, events in the last CLAIM_WINDOW_DAYS:
 *   outstanding = lost + damaged − found − reimbursed   (floored at 0)
 * Offsets (found / reimbursed) are counted over a slightly wider window so
 * a reimbursement for a day-59 loss still cancels it. Amazon auto-covers
 * most losses — this exists for the ones that slip through.
 *
 * Unknown adjustment reasons are never silently counted OR dropped: they
 * surface in the snapshot for human triage (same pattern as the PayPal
 * plan's unclassified bucket). Filing the claim itself has no API — that
 * stays a Seller Central step; we deep-link it.
 */

import {
  createReport,
  getReportStatus,
  downloadReportRows,
  normalizeSellerSku,
} from '../amazonSp/client';

export const CLAIM_WINDOW_DAYS = 60;
const OFFSET_WINDOW_DAYS = 80; // founds/reimbursements may trail the loss

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchReport(
  reportType: string,
  fromIso: string,
  toIso: string,
  { pollMs = 10_000, maxPolls = 24 }: { pollMs?: number; maxPolls?: number } = {}
): Promise<Record<string, string>[]> {
  const reportId = await createReport(reportType, fromIso, toIso);
  for (let i = 0; i < maxPolls; i++) {
    const st = await getReportStatus(reportId);
    if (st.processingStatus === 'DONE' && st.reportDocumentId) {
      return downloadReportRows(st.reportDocumentId);
    }
    if (st.processingStatus === 'CANCELLED' || st.processingStatus === 'FATAL') {
      throw new Error(`Amazon report ${reportType} ${st.processingStatus}.`);
    }
    await sleep(pollMs);
  }
  throw new Error(`Amazon report ${reportType} did not finish in time.`);
}

export async function fetchLedgerRows(fromIso: string, toIso: string) {
  return fetchReport('GET_LEDGER_DETAIL_VIEW_DATA', fromIso, toIso);
}

export async function fetchReimbursementRows(fromIso: string, toIso: string) {
  return fetchReport('GET_FBA_REIMBURSEMENTS_DATA', fromIso, toIso);
}

/** Case/space-tolerant column getter — report headers vary in casing. */
function col(row: Record<string, string>, name: string): string {
  const want = name.toLowerCase().replace(/[\s_-]/g, '');
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().replace(/[\s_-]/g, '') === want) return String(row[key] ?? '').trim();
  }
  return '';
}

export interface ClaimEvent {
  date: string; // YYYY-MM-DD
  kind: 'lost' | 'damaged' | 'found';
  qty: number; // positive units
  reason: string;
  fc: string;
}

export interface ClaimRow {
  sku: string;
  title: string;
  lost: number;
  damaged: number;
  found: number;
  reimbursed: number;
  outstanding: number;
  oldestEventDate: string;
  daysLeft: number; // of the 60-day window, from the oldest in-window loss
  events: ClaimEvent[];
}

export interface ClaimsSnapshot {
  computedAt: string;
  windowFrom: string;
  rows: ClaimRow[];
  /** Adjustment reasons we didn't recognize — triage, never auto-counted. */
  unknownReasons: Array<{ reason: string; qty: number; count: number }>;
  totals: { outstandingUnits: number; expiringSoon: number };
}

// Tolerant reason classification (ledger uses terse codes AND prose,
// varying by account era — never strict-equal, per house rule).
const isLostReason = (r: string) => /^m\b|misplaced|lost/i.test(r);
const isDamagedReason = (r: string) => /^d\b|^e\b|damaged/i.test(r);
const isFoundReason = (r: string) => /^f\b|found/i.test(r);

export function computeClaimableLosses(
  ledgerRows: Record<string, string>[],
  reimbursementRows: Record<string, string>[],
  now: Date = new Date()
): ClaimsSnapshot {
  const nowMs = now.getTime();
  const claimFromMs = nowMs - CLAIM_WINDOW_DAYS * 864e5;
  const offsetFromMs = nowMs - OFFSET_WINDOW_DAYS * 864e5;
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  interface Agg {
    title: string;
    lost: number;
    damaged: number;
    found: number;
    reimbursed: number;
    events: ClaimEvent[];
  }
  const bySku = new Map<string, Agg>();
  const agg = (sku: string, title: string): Agg => {
    const cur = bySku.get(sku) ?? { title, lost: 0, damaged: 0, found: 0, reimbursed: 0, events: [] };
    if (title && !cur.title) cur.title = title;
    bySku.set(sku, cur);
    return cur;
  };
  const unknown = new Map<string, { qty: number; count: number }>();

  for (const row of ledgerRows) {
    const eventType = col(row, 'Event Type');
    if (!/adjust/i.test(eventType)) continue; // receipts/shipments/returns/transfers: not loss events
    const dateStr = col(row, 'Date').slice(0, 10);
    const eventMs = new Date(`${dateStr}T00:00:00Z`).getTime();
    if (!Number.isFinite(eventMs)) continue;
    const sku = normalizeSellerSku(col(row, 'MSKU'));
    if (!sku) continue;
    const qty = Number(col(row, 'Quantity')) || 0;
    if (qty === 0) continue;
    const reason = col(row, 'Reason') || col(row, 'Disposition');
    const fc = col(row, 'Fulfillment Center');
    const title = col(row, 'Title');

    if (qty < 0 && isLostReason(reason)) {
      if (eventMs < claimFromMs) continue; // older than the claim window — gone
      const a = agg(sku, title);
      a.lost += -qty;
      a.events.push({ date: dateStr, kind: 'lost', qty: -qty, reason, fc });
    } else if (qty < 0 && isDamagedReason(reason)) {
      if (eventMs < claimFromMs) continue;
      const a = agg(sku, title);
      a.damaged += -qty;
      a.events.push({ date: dateStr, kind: 'damaged', qty: -qty, reason, fc });
    } else if (qty > 0 && isFoundReason(reason)) {
      if (eventMs < offsetFromMs) continue;
      const a = agg(sku, title);
      a.found += qty;
      a.events.push({ date: dateStr, kind: 'found', qty, reason, fc });
    } else {
      // Unrecognized adjustment — surfaced, never counted.
      const key = reason || '(no reason)';
      const u = unknown.get(key) ?? { qty: 0, count: 0 };
      u.qty += qty;
      u.count += 1;
      unknown.set(key, u);
    }
  }

  for (const row of reimbursementRows) {
    const reason = col(row, 'reason');
    // Warehouse/inbound loss reimbursements offset claims; customer-return
    // reimbursements are a different flow and must not.
    if (!/lost|damaged|missing/i.test(reason) || /customer/i.test(reason)) continue;
    const dateStr = col(row, 'approval-date').slice(0, 10);
    const eventMs = new Date(`${dateStr}T00:00:00Z`).getTime();
    if (Number.isFinite(eventMs) && eventMs < offsetFromMs) continue;
    const sku = normalizeSellerSku(col(row, 'sku'));
    if (!sku) continue;
    const qty = Number(col(row, 'quantity-reimbursed-total')) || 0;
    if (qty <= 0) continue;
    agg(sku, col(row, 'product-name')).reimbursed += qty;
  }

  const rows: ClaimRow[] = [];
  for (const [sku, a] of bySku) {
    const outstanding = Math.max(0, a.lost + a.damaged - a.found - a.reimbursed);
    if (outstanding <= 0) continue;
    const lossDates = a.events.filter((e) => e.kind !== 'found').map((e) => e.date);
    const oldest = lossDates.sort()[0] ?? day(nowMs);
    const ageDays = Math.floor((nowMs - new Date(`${oldest}T00:00:00Z`).getTime()) / 864e5);
    rows.push({
      sku,
      title: a.title,
      lost: a.lost,
      damaged: a.damaged,
      found: a.found,
      reimbursed: a.reimbursed,
      outstanding,
      oldestEventDate: oldest,
      daysLeft: Math.max(0, CLAIM_WINDOW_DAYS - ageDays),
      events: a.events.sort((x, y) => x.date.localeCompare(y.date)),
    });
  }
  rows.sort((x, y) => x.daysLeft - y.daysLeft);

  return {
    computedAt: now.toISOString(),
    windowFrom: day(claimFromMs),
    rows,
    unknownReasons: Array.from(unknown.entries()).map(([reason, u]) => ({ reason, ...u })),
    totals: {
      outstandingUnits: rows.reduce((s, r) => s + r.outstanding, 0),
      expiringSoon: rows.filter((r) => r.daysLeft <= 10).length,
    },
  };
}

/** Fetch both reports and compute — the cron's and refresh button's core. */
export async function buildClaimsSnapshot(now: Date = new Date()): Promise<ClaimsSnapshot> {
  const toIso = now.toISOString();
  const ledgerFrom = new Date(now.getTime() - OFFSET_WINDOW_DAYS * 864e5).toISOString();
  const [ledger, reimb] = await Promise.all([
    fetchLedgerRows(ledgerFrom, toIso),
    fetchReimbursementRows(ledgerFrom, toIso),
  ]);
  return computeClaimableLosses(ledger, reimb, now);
}
