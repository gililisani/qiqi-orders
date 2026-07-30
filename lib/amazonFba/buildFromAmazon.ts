/**
 * Builds a month's NetSuite-ready preview straight from the SP-API Finances
 * data — the automated replacement for the CSV upload. Produces the SAME
 * MonthPreview shape the CSV parser emits, so the existing month card UI,
 * validation, and push route work unchanged.
 *
 * Differences vs the CSV path (all upgrades):
 *  - Real SellerSKU + QuantityShipped per line — no name mapping, no
 *    quantity inference, no truncated multi-product rows.
 *  - Promotions are itemized (seller-funded only), not residual-derived.
 *  - Fee buckets keep their Amazon fee-type labels on the vendor bill.
 *
 * SKU → NetSuite item resolution order:
 *  1. Hub catalog by normalized SKU (FPS0030-FBA → FPS0030), NS internal id
 *     via the same SKU lookup the Sales Order push uses.
 *  2. amazon_item_map by the raw seller SKU (manual override / odd SKUs).
 *  3. Unresolved → "needs attention" row, blocks the push until mapped.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { NetSuiteAPI } from '../netsuite';
import { normalizeSellerSku, type FinancialEvents } from '../amazonSp/client';
import { summarizeFinancialEvents, feeLabel } from '../amazonSp/overview';
import type { MonthPreview, SaleLine, FeeLine, AttentionRow } from './parseReport';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface SkuResolution {
  nsItemId: string;
  nsItemName: string;
}

/** Pure transform: financial events + SKU map → MonthPreview. Unit tested. */
export function buildMonthPreviewFromEvents(
  period: string, // YYYY-MM
  events: FinancialEvents,
  skuMap: Map<string, SkuResolution> // keyed by RAW seller SKU
): MonthPreview {
  const [yearStr, monthStr] = period.split('-');
  const year = parseInt(yearStr, 10);
  const monthNo = parseInt(monthStr, 10);
  const lastDay = new Date(Date.UTC(year, monthNo, 0)).getUTCDate();
  const summary = summarizeFinancialEvents(events);

  const saleLines: SaleLine[] = [];
  const needsAttention: AttentionRow[] = [];
  const orderIds = new Set<string>();

  for (const shipment of events.ShipmentEventList || []) {
    const orderId = shipment.AmazonOrderId || '';
    if (orderId) orderIds.add(orderId);
    const postedDate = (shipment.PostedDate || '').split('T')[0];
    for (const item of shipment.ShipmentItemList || []) {
      const sellerSku = item.SellerSKU || '';
      const quantity = Number(item.QuantityShipped) || 0;
      const principal = round2(
        (item.ItemChargeList || [])
          .filter((c: any) => c.ChargeType === 'Principal')
          .reduce((s: number, c: any) => s + (Number(c.ChargeAmount?.CurrencyAmount) || 0), 0)
      );
      if (principal === 0) continue; // giveaways / zero-charge — nothing to book
      const attentionRow = {
        date: postedDate,
        month: period,
        type: 'Order Payment',
        orderId,
        product: sellerSku,
        productCharges: principal,
        promoRebates: 0,
        amazonFees: 0,
        other: 0,
        total: principal,
      };
      if (quantity <= 0) {
        needsAttention.push({ reason: 'ambiguous-quantity', row: attentionRow });
        continue;
      }
      const resolved = skuMap.get(sellerSku);
      if (!resolved) {
        needsAttention.push({ reason: 'unmapped-product', row: attentionRow });
        continue;
      }
      saleLines.push({
        orderId,
        amazonName: sellerSku,
        nsItemId: resolved.nsItemId,
        nsItemName: resolved.nsItemName,
        quantity,
        // Full-precision rate so quantity × rate always equals Amazon's charge.
        unitPrice: principal / quantity,
        amount: principal,
      });
    }
  }

  // Event lists the summarizer doesn't itemize (chargebacks, ads, …) —
  // surfaced for acknowledgment rather than silently dropped.
  for (const other of summary.otherEvents) {
    needsAttention.push({
      reason: 'unknown-type',
      row: {
        date: '',
        month: period,
        type: other.list,
        orderId: '',
        product: `${other.list} (${other.count} event(s)) — review in Amazon, not auto-booked`,
        productCharges: 0,
        promoRebates: 0,
        amazonFees: 0,
        other: 0,
        total: 0,
      },
    });
  }

  const feeLines: FeeLine[] = summary.feeBuckets.map((bucket) => ({
    label: feeLabel(bucket.feeType),
    bucket: /advertis|sponsored/i.test(bucket.feeType) ? 'advertising' : 'platform',
    amount: bucket.amount,
  }));
  const feeTotal = round2(feeLines.reduce((s, l) => s + l.amount, 0));

  const grossSales = round2(saleLines.reduce((s, l) => s + l.amount, 0));
  const discountTotal = round2(-summary.promotions);
  const refundTotal = round2(-summary.refundTotal);
  const net = round2(
    grossSales + discountTotal + refundTotal - feeTotal + summary.reimbursementTotal
  );

  return {
    period,
    periodLabel: `${MONTH_NAMES[monthNo - 1]} ${year}`,
    tranDate: `${period}-${String(lastDay).padStart(2, '0')}`,
    saleLines,
    grossSales,
    discountTotal,
    orderCount: orderIds.size,
    refundTotal,
    refundCount: summary.refunds.length,
    feeLines,
    feeTotal,
    reimbursementTotal: summary.reimbursementTotal,
    needsAttention,
    skippedBalanceRows: 0,
    reportNet: net,
    computedNet: net,
    reconciles: needsAttention.length === 0,
  };
}

/**
 * Resolve every seller SKU in the events to a NetSuite item:
 * catalog (normalized SKU) first, then amazon_item_map (raw seller SKU).
 */
export async function resolveSellerSkus(
  events: FinancialEvents,
  supabaseAdmin: SupabaseClient,
  ns: NetSuiteAPI
): Promise<Map<string, SkuResolution>> {
  const sellerSkus = new Set<string>();
  for (const shipment of events.ShipmentEventList || []) {
    for (const item of shipment.ShipmentItemList || []) {
      if (item.SellerSKU) sellerSkus.add(item.SellerSKU);
    }
  }
  const result = new Map<string, SkuResolution>();
  if (sellerSkus.size === 0) return result;

  const normalized = [...sellerSkus].map((raw) => ({ raw, catalog: normalizeSellerSku(raw) }));

  const { data: products } = await supabaseAdmin
    .from('Products')
    .select('sku, netsuite_name, item_name')
    .in('sku', normalized.map((n) => n.catalog));
  const catalogBySku = new Map((products || []).map((p: any) => [p.sku, p]));

  const catalogSkus = normalized.filter((n) => catalogBySku.has(n.catalog)).map((n) => n.catalog);
  const nsIds = catalogSkus.length > 0 ? await ns.resolveItemIdsBySku([...new Set(catalogSkus)]) : new Map();

  for (const { raw, catalog } of normalized) {
    const product = catalogBySku.get(catalog);
    const nsId = nsIds.get(catalog);
    if (product && nsId) {
      result.set(raw, { nsItemId: nsId, nsItemName: product.netsuite_name || product.item_name || catalog });
    }
  }

  // Fallback: manual map keyed by the raw seller SKU (amazon_name column).
  const unresolvedRaw = [...sellerSkus].filter((raw) => !result.has(raw));
  if (unresolvedRaw.length > 0) {
    const { data: mappings } = await supabaseAdmin
      .from('amazon_item_map')
      .select('amazon_name, ns_item_id, ns_item_name')
      .in('amazon_name', unresolvedRaw);
    for (const m of mappings || []) {
      result.set(m.amazon_name, { nsItemId: m.ns_item_id, nsItemName: m.ns_item_name });
    }
  }

  return result;
}
