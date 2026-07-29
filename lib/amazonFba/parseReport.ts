/**
 * Amazon FBA "All Transactions" report parser.
 *
 * Input: the CSV an admin downloads from Seller Central (Payments → All
 * Transactions), covering any date range. Output: per-calendar-month
 * breakdowns ready to become NetSuite records:
 *
 *   - Cash Sale lines (one per order row, qty inferred from unit price)
 *   - seller-funded discount total (promo rebates NOT offset by "Other")
 *   - Cash Refund total (product portion of refund rows)
 *   - Vendor Bill fee lines (per-order Amazon fees + service fees by type,
 *     net of fee give-backs on refunds)
 *   - Inventory reimbursement total (journal 100505 / write-off account)
 *
 * Rows that can't be decoded automatically (multi-product orders truncated
 * by Amazon, unknown transaction types, non-integer quantities) are surfaced
 * as `needsAttention` — the UI requires the admin to resolve them before
 * pushing. Reserve-balance rows are noise and are skipped (but counted).
 *
 * Pure functions only — no I/O — so the whole pipeline is unit-testable.
 */

export interface AmazonItemMapping {
  /** Normalized match key — lowercased truncated Amazon product name. */
  amazon_name: string;
  ns_item_id: string;
  ns_item_name: string;
  unit_price: number;
}

export interface ParsedRow {
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  type: string;
  orderId: string;
  product: string;
  productCharges: number;
  promoRebates: number;
  amazonFees: number;
  other: number;
  total: number;
}

export interface SaleLine {
  orderId: string;
  amazonName: string;
  nsItemId: string;
  nsItemName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface AttentionRow {
  reason: 'unmapped-product' | 'ambiguous-quantity' | 'multi-product' | 'unknown-type';
  row: ParsedRow;
}

export interface FeeLine {
  label: string;
  /** 'platform' → Amazon Platform Fees; 'advertising' → Amazon Advertisement */
  bucket: 'platform' | 'advertising';
  amount: number; // positive = we owe Amazon
}

export interface MonthPreview {
  period: string; // YYYY-MM
  periodLabel: string; // "January 2026"
  tranDate: string; // last day of month, YYYY-MM-DD
  saleLines: SaleLine[];
  grossSales: number;
  discountTotal: number; // negative or 0 — seller-funded promos
  orderCount: number;
  refundTotal: number; // negative or 0 — product portion of refunds
  refundCount: number;
  feeLines: FeeLine[];
  feeTotal: number; // positive — vendor bill total
  reimbursementTotal: number; // positive or 0
  needsAttention: AttentionRow[];
  skippedBalanceRows: number;
  /** Sum of the report's own "Total (USD)" column (excl. balance rows). */
  reportNet: number;
  /** gross + discounts + refunds − fees + reimbursements. */
  computedNet: number;
  reconciles: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ---------------------------------------------------------------------------
// CSV parsing (RFC-4180-ish: quoted fields, embedded commas/quotes, BOM)
// ---------------------------------------------------------------------------
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}

function parseAmazonDate(s: string): { iso: string; month: string } | null {
  const m = (s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, '0');
  return { iso: `${year}-${mm}-${String(day).padStart(2, '0')}`, month: `${year}-${mm}` };
}

function num(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Normalize an Amazon product name into a stable mapping key. */
export function normalizeAmazonName(name: string): string {
  return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Report → typed rows
// ---------------------------------------------------------------------------
export function parseReportRows(csvText: string): { rows: ParsedRow[]; errors: string[] } {
  const raw = parseCsv(csvText);
  const errors: string[] = [];
  if (raw.length < 2) return { rows: [], errors: ['File has no data rows.'] };

  const header = raw[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.findIndex((h) => h === name.toLowerCase());
  const iDate = col('Date');
  const iType = col('Transaction type');
  const iOrder = col('Order ID');
  const iProduct = col('Product Details');
  const iCharges = col('Total product charges');
  const iPromo = col('Total promotional rebates');
  const iFees = col('Amazon fees');
  const iOther = col('Other');
  const iTotal = col('Total (USD)');
  if ([iDate, iType, iProduct, iCharges, iPromo, iFees, iOther, iTotal].some((i) => i < 0)) {
    return {
      rows: [],
      errors: [
        'This does not look like an Amazon "All Transactions" report — expected columns: Date, Transaction type, Order ID, Product Details, Total product charges, Total promotional rebates, Amazon fees, Other, Total (USD).',
      ],
    };
  }

  const rows: ParsedRow[] = [];
  for (let r = 1; r < raw.length; r++) {
    const cells = raw[r];
    const d = parseAmazonDate(cells[iDate]);
    if (!d) {
      errors.push(`Row ${r + 1}: unparseable date "${cells[iDate]}" — row skipped.`);
      continue;
    }
    rows.push({
      date: d.iso,
      month: d.month,
      type: (cells[iType] || '').trim(),
      orderId: (cells[iOrder] || '').trim(),
      product: (cells[iProduct] || '').trim(),
      productCharges: num(cells[iCharges]),
      promoRebates: num(cells[iPromo]),
      amazonFees: num(cells[iFees]),
      other: num(cells[iOther]),
      total: num(cells[iTotal]),
    });
  }
  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Typed rows → per-month previews
// ---------------------------------------------------------------------------
export function buildMonthPreviews(
  rows: ParsedRow[],
  mappings: AmazonItemMapping[]
): MonthPreview[] {
  const mapByName = new Map(mappings.map((m) => [normalizeAmazonName(m.amazon_name), m]));
  const findMapping = (product: string): AmazonItemMapping | undefined => {
    const key = normalizeAmazonName(product);
    if (mapByName.has(key)) return mapByName.get(key);
    // Truncated names end with "..." — also try prefix matching both ways.
    for (const [mapKey, m] of mapByName) {
      const a = key.replace(/\.{3}$/, '');
      const b = mapKey.replace(/\.{3}$/, '');
      if (a.startsWith(b) || b.startsWith(a)) return m;
    }
    return undefined;
  };

  const months = new Map<string, ParsedRow[]>();
  for (const row of rows) {
    if (!months.has(row.month)) months.set(row.month, []);
    months.get(row.month)!.push(row);
  }

  const previews: MonthPreview[] = [];
  for (const [period, monthRows] of [...months.entries()].sort()) {
    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr, 10);
    const monthNo = parseInt(monthStr, 10);
    const lastDay = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();

    const preview: MonthPreview = {
      period,
      periodLabel: `${MONTH_NAMES[monthNo - 1]} ${year}`,
      tranDate: `${period}-${String(lastDay).padStart(2, '0')}`,
      saleLines: [],
      grossSales: 0,
      discountTotal: 0,
      orderCount: 0,
      refundTotal: 0,
      refundCount: 0,
      feeLines: [],
      feeTotal: 0,
      reimbursementTotal: 0,
      needsAttention: [],
      skippedBalanceRows: 0,
      reportNet: 0,
      computedNet: 0,
      reconciles: false,
    };

    const orderIds = new Set<string>();
    let orderFees = 0;
    let refundFeeGiveback = 0;
    const serviceFees = new Map<string, number>();

    for (const row of monthRows) {
      const typeLower = row.type.toLowerCase();

      if (typeLower.includes('balance')) {
        preview.skippedBalanceRows++;
        continue; // reserve accounting noise — excluded from everything
      }
      preview.reportNet = round2(preview.reportNet + row.total);

      if (typeLower === 'order payment') {
        orderIds.add(row.orderId);
        orderFees += row.amazonFees;
        const residual = round2(row.promoRebates + row.other);
        if (residual !== 0) preview.discountTotal = round2(preview.discountTotal + residual);

        if (row.productCharges === 0) {
          // Zero-charge row (fully discounted giveaway) — nothing to sell.
          continue;
        }
        if (row.product.includes(',')) {
          preview.needsAttention.push({ reason: 'multi-product', row });
          continue;
        }
        const mapping = findMapping(row.product);
        if (!mapping) {
          preview.needsAttention.push({ reason: 'unmapped-product', row });
          continue;
        }
        const qty = row.productCharges / mapping.unit_price;
        if (!Number.isInteger(round2(qty)) || qty <= 0) {
          preview.needsAttention.push({ reason: 'ambiguous-quantity', row });
          continue;
        }
        preview.saleLines.push({
          orderId: row.orderId,
          amazonName: row.product,
          nsItemId: mapping.ns_item_id,
          nsItemName: mapping.ns_item_name,
          quantity: Math.round(qty),
          unitPrice: mapping.unit_price,
          amount: round2(row.productCharges),
        });
        preview.grossSales = round2(preview.grossSales + row.productCharges);
      } else if (typeLower === 'refund') {
        // Product portion (charges + promo + other); the fee column is
        // Amazon giving back part of its fee — that nets the vendor bill.
        preview.refundCount++;
        preview.refundTotal = round2(
          preview.refundTotal + row.productCharges + row.promoRebates + row.other
        );
        refundFeeGiveback += row.amazonFees;
      } else if (typeLower === 'service fees') {
        const label = row.product || 'Service fee';
        serviceFees.set(label, round2((serviceFees.get(label) || 0) + row.total));
      } else if (typeLower === 'inventory reimbursement') {
        preview.reimbursementTotal = round2(preview.reimbursementTotal + row.total);
      } else {
        preview.needsAttention.push({ reason: 'unknown-type', row });
      }
    }

    preview.orderCount = orderIds.size;

    // Vendor bill lines (amounts flipped to positive = what we owe Amazon)
    if (orderFees !== 0) {
      preview.feeLines.push({
        label: 'Referral & FBA fees on orders',
        bucket: 'platform',
        amount: round2(-orderFees),
      });
    }
    for (const [label, amount] of [...serviceFees.entries()].sort()) {
      preview.feeLines.push({
        label,
        bucket: /advertis|sponsored/i.test(label) ? 'advertising' : 'platform',
        amount: round2(-amount),
      });
    }
    if (refundFeeGiveback !== 0) {
      preview.feeLines.push({
        label: 'Fee refunds on returned orders',
        bucket: 'platform',
        amount: round2(-refundFeeGiveback),
      });
    }
    preview.feeTotal = round2(preview.feeLines.reduce((s, l) => s + l.amount, 0));

    // Reconciliation: what we'd book vs what the report says moved.
    // Unresolved attention rows contribute their raw totals so the check
    // only turns green once everything is accounted for.
    const attentionSalesPortion = preview.needsAttention
      .filter((a) => a.reason !== 'unknown-type')
      .reduce((s, a) => s + a.row.productCharges, 0);
    preview.computedNet = round2(
      preview.grossSales +
        attentionSalesPortion + // still-unmapped sales keep the math honest
        preview.discountTotal +
        preview.refundTotal -
        preview.feeTotal +
        preview.reimbursementTotal +
        preview.needsAttention
          .filter((a) => a.reason === 'unknown-type')
          .reduce((s, a) => s + a.row.total, 0)
    );
    preview.reconciles =
      Math.abs(preview.computedNet - preview.reportNet) < 0.01 &&
      preview.needsAttention.length === 0;

    previews.push(preview);
  }
  return previews;
}
