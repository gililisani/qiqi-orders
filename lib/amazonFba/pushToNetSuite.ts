/**
 * Amazon FBA month → NetSuite records.
 *
 * Creates, in order (each step idempotent via NS external ids):
 *   1. Cash Sale    AMAZON-FBA-{period}          gross sales + discount line
 *   2. Cash Refund  AMAZON-FBA-REFUND-{period}   product portion of refunds
 *   3. Vendor Bill  AMAZON-FBA-FEES-{period}     Amazon's fees by type
 *   4. Bill Payment AMAZON-FBA-FEEPAY-{period}   paid from the Amazon account
 *   5. Journal      AMAZON-FBA-REIMB-{period}    reimbursements (bank / write-off)
 *
 * Lot assignment: items at the Amazon FBA location are lot-numbered, so each
 * cash-sale line carries an inventoryDetail. Per the owner's rule there is no
 * FEFO — any available lot works, split across lots when one isn't enough.
 */

import { NetSuiteAPI } from '../netsuite';
import type { FeeLine, SaleLine } from './parseReport';

export interface AmazonFbaConfig {
  customer_ns_id: string;
  vendor_ns_id: string;
  subsidiary_ns_id: string;
  location_ns_id: string;
  currency_ns_id: string;
  class_name: string;
  bank_account_ns_id: string;
  platform_fees_account_ns_id: string;
  advertising_account_ns_id: string;
  writeoff_account_ns_id: string;
  refund_item_ns_id: string;
  discount_item_ns_id: string;
}

export interface MonthPushInput {
  period: string; // YYYY-MM
  periodLabel: string; // "January 2026"
  tranDate: string; // YYYY-MM-DD (last day of month)
  saleLines: SaleLine[];
  discountTotal: number;
  refundTotal: number;
  feeLines: FeeLine[];
  reimbursementTotal: number;
}

export interface PushStepResult {
  step: 'cashSale' | 'cashRefund' | 'vendorBill' | 'billPayment' | 'journal';
  status: 'created' | 'existed' | 'skipped';
  nsId?: string;
  tranId?: string;
}

/**
 * Config fields required for what this month actually books.
 * Returns human-readable names of anything missing.
 */
export function missingConfigFields(config: AmazonFbaConfig, input: MonthPushInput): string[] {
  const missing: string[] = [];
  const need = (key: keyof AmazonFbaConfig, label: string) => {
    if (!config[key]) missing.push(label);
  };
  need('customer_ns_id', 'Amazon customer');
  need('subsidiary_ns_id', 'Subsidiary');
  need('location_ns_id', 'Amazon FBA location');
  need('bank_account_ns_id', 'Amazon bank account (100505)');
  if (input.discountTotal !== 0) need('discount_item_ns_id', 'Discount item');
  if (input.refundTotal !== 0) need('refund_item_ns_id', 'Refund item');
  if (input.feeLines.length > 0) {
    need('vendor_ns_id', 'Amazon vendor (V5322)');
    need('platform_fees_account_ns_id', 'Platform fees account (622040)');
    if (input.feeLines.some((l) => l.bucket === 'advertising')) {
      need('advertising_account_ns_id', 'Advertising account (630040)');
    }
  }
  if (input.reimbursementTotal !== 0) need('writeoff_account_ns_id', 'Write-off account (620070)');
  return missing;
}

/** Validate internal consistency of a push payload (client-supplied). */
export function validatePushInput(input: MonthPushInput): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}$/.test(input.period)) errors.push('Invalid period.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.tranDate) || !input.tranDate.startsWith(input.period)) {
    errors.push('Transaction date must fall inside the period.');
  }
  for (const line of input.saleLines) {
    if (!line.nsItemId) errors.push(`Line for order ${line.orderId} has no NetSuite item.`);
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      errors.push(`Line for order ${line.orderId} has invalid quantity ${line.quantity}.`);
    }
    if (Math.abs(line.quantity * line.unitPrice - line.amount) > 0.01) {
      errors.push(
        `Line for order ${line.orderId}: qty ${line.quantity} × $${line.unitPrice} ≠ $${line.amount}.`
      );
    }
  }
  const hasAnything =
    input.saleLines.length > 0 ||
    input.refundTotal !== 0 ||
    input.feeLines.length > 0 ||
    input.reimbursementTotal !== 0;
  if (!hasAnything) errors.push('Nothing to push for this month.');
  return errors;
}

// ---------------------------------------------------------------------------
// Lot assignment
// ---------------------------------------------------------------------------
interface LotAssignment {
  lotId: string;
  quantity: number;
}

export async function planLotAssignments(
  ns: NetSuiteAPI,
  locationNsId: string,
  saleLines: SaleLine[]
): Promise<Map<number, LotAssignment[]>> {
  const itemIds = [...new Set(saleLines.map((l) => l.nsItemId))];
  if (itemIds.length === 0) return new Map();

  const rows = await ns.suiteQL<{
    item: string;
    inventorynumber: string;
    quantityavailable: string;
  }>(
    `SELECT item, inventorynumber, quantityavailable
       FROM InventoryBalance
      WHERE location = ${Number(locationNsId)}
        AND quantityavailable > 0
        AND item IN (${itemIds.map((i) => Number(i)).join(', ')})`
  );

  // Pool of available lots per item ("any lot" rule — no FEFO, stable order).
  const pools = new Map<string, { lotId: string; available: number }[]>();
  for (const row of rows) {
    const itemId = String(row.item);
    if (!pools.has(itemId)) pools.set(itemId, []);
    pools.get(itemId)!.push({
      lotId: String(row.inventorynumber),
      available: parseFloat(row.quantityavailable) || 0,
    });
  }

  const plan = new Map<number, LotAssignment[]>();
  const shortages: string[] = [];
  saleLines.forEach((line, index) => {
    const pool = pools.get(line.nsItemId) || [];
    let remaining = line.quantity;
    const assignments: LotAssignment[] = [];
    for (const lot of pool) {
      if (remaining <= 0) break;
      if (lot.available <= 0) continue;
      const take = Math.min(lot.available, remaining);
      assignments.push({ lotId: lot.lotId, quantity: take });
      lot.available -= take;
      remaining -= take;
    }
    if (remaining > 0) {
      shortages.push(
        `${line.nsItemName}: need ${line.quantity}, only ${line.quantity - remaining} available across lots at Amazon FBA`
      );
    } else {
      plan.set(index, assignments);
    }
  });

  if (shortages.length > 0) {
    throw new Error(
      `Not enough lot-numbered inventory at the Amazon FBA location:\n${[...new Set(shortages)].join('\n')}\n` +
      'Adjust inventory in NetSuite (or fix item mapping) and retry.'
    );
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Record push
// ---------------------------------------------------------------------------
const round2 = (n: number) => Math.round(n * 100) / 100;

async function ensureRecord(
  ns: NetSuiteAPI,
  results: PushStepResult[],
  step: PushStepResult['step'],
  recordType: string,
  externalId: string,
  create: () => Promise<string>
): Promise<string> {
  const existing = await ns.findRecordIdByExternalId(recordType, externalId);
  if (existing) {
    const tranId = await ns.getTranId(recordType, existing);
    results.push({ step, status: 'existed', nsId: existing, tranId });
    return existing;
  }
  const id = await create();
  const tranId = await ns.getTranId(recordType, id);
  results.push({ step, status: 'created', nsId: id, tranId });
  return id;
}

export async function pushMonthToNetSuite(
  ns: NetSuiteAPI,
  config: AmazonFbaConfig,
  input: MonthPushInput
): Promise<PushStepResult[]> {
  const results: PushStepResult[] = [];
  const classRef = config.class_name ? { class: { refName: config.class_name } } : {};

  // -- 1. Cash Sale ----------------------------------------------------------
  if (input.saleLines.length > 0 || input.discountTotal !== 0) {
    const lotPlan = await planLotAssignments(ns, config.location_ns_id, input.saleLines);

    const items: Record<string, unknown>[] = input.saleLines.map((line, index) => ({
      item: { id: line.nsItemId },
      quantity: line.quantity,
      rate: line.unitPrice,
      description: line.orderId,
      inventoryDetail: {
        inventoryAssignment: {
          items: (lotPlan.get(index) || []).map((a) => ({
            issueInventoryNumber: { id: a.lotId },
            quantity: a.quantity,
          })),
        },
      },
    }));

    if (input.discountTotal !== 0) {
      items.push({
        item: { id: config.discount_item_ns_id },
        rate: round2(input.discountTotal),
        description: `Amazon promotions ${input.periodLabel}`,
      });
    }

    await ensureRecord(ns, results, 'cashSale', 'cashSale', `AMAZON-FBA-${input.period}`, () =>
      ns.createRecord('cashSale', {
        externalId: `AMAZON-FBA-${input.period}`,
        entity: { id: config.customer_ns_id },
        subsidiary: { id: config.subsidiary_ns_id },
        location: { id: config.location_ns_id },
        currency: { id: config.currency_ns_id || '1' },
        tranDate: input.tranDate,
        memo: `Amazon ${input.periodLabel} Sales`,
        undepFunds: false,
        account: { id: config.bank_account_ns_id },
        ...classRef,
        item: { items },
      })
    );
  } else {
    results.push({ step: 'cashSale', status: 'skipped' });
  }

  // -- 2. Cash Refund --------------------------------------------------------
  if (input.refundTotal !== 0) {
    await ensureRecord(ns, results, 'cashRefund', 'cashRefund', `AMAZON-FBA-REFUND-${input.period}`, () =>
      ns.createRecord('cashRefund', {
        externalId: `AMAZON-FBA-REFUND-${input.period}`,
        entity: { id: config.customer_ns_id },
        subsidiary: { id: config.subsidiary_ns_id },
        location: { id: config.location_ns_id },
        currency: { id: config.currency_ns_id || '1' },
        tranDate: input.tranDate,
        memo: `Amazon ${input.periodLabel} Refunds`,
        undepFunds: false,
        account: { id: config.bank_account_ns_id },
        ...classRef,
        item: {
          items: [
            {
              item: { id: config.refund_item_ns_id },
              quantity: 1,
              rate: round2(Math.abs(input.refundTotal)),
              description: `Amazon customer refunds ${input.periodLabel}`,
            },
          ],
        },
      })
    );
  } else {
    results.push({ step: 'cashRefund', status: 'skipped' });
  }

  // -- 3 + 4. Vendor Bill + Bill Payment ------------------------------------
  if (input.feeLines.length > 0) {
    const billId = await ensureRecord(ns, results, 'vendorBill', 'vendorBill', `AMAZON-FBA-FEES-${input.period}`, () =>
      ns.createRecord('vendorBill', {
        externalId: `AMAZON-FBA-FEES-${input.period}`,
        // "Invoice Number" (vendor reference) is mandatory on this account.
        tranId: `AMAZON-FBA-FEES-${input.period}`,
        entity: { id: config.vendor_ns_id },
        subsidiary: { id: config.subsidiary_ns_id },
        currency: { id: config.currency_ns_id || '1' },
        tranDate: input.tranDate,
        memo: `Amazon ${input.periodLabel} Fees`,
        ...classRef,
        expense: {
          items: input.feeLines.map((line) => ({
            account: {
              id:
                line.bucket === 'advertising'
                  ? config.advertising_account_ns_id
                  : config.platform_fees_account_ns_id,
            },
            amount: round2(line.amount),
            memo: line.label,
            ...(config.class_name ? { class: { refName: config.class_name } } : {}),
          })),
        },
      })
    );

    const payExternalId = `AMAZON-FBA-FEEPAY-${input.period}`;
    await ensureRecord(ns, results, 'billPayment', 'vendorPayment', payExternalId, () =>
      ns.transformRecord('vendorBill', billId, 'vendorPayment', {
        externalId: payExternalId,
        tranDate: input.tranDate,
        account: { id: config.bank_account_ns_id },
        memo: `Amazon ${input.periodLabel} fees payment`,
      })
    );
  } else {
    results.push({ step: 'vendorBill', status: 'skipped' });
    results.push({ step: 'billPayment', status: 'skipped' });
  }

  // -- 5. Reimbursement journal ---------------------------------------------
  if (input.reimbursementTotal !== 0) {
    const amount = round2(Math.abs(input.reimbursementTotal));
    const debitBank = input.reimbursementTotal > 0;
    await ensureRecord(ns, results, 'journal', 'journalEntry', `AMAZON-FBA-REIMB-${input.period}`, () =>
      ns.createRecord('journalEntry', {
        externalId: `AMAZON-FBA-REIMB-${input.period}`,
        subsidiary: { id: config.subsidiary_ns_id },
        currency: { id: config.currency_ns_id || '1' },
        tranDate: input.tranDate,
        memo: `Amazon FBA reimbursements ${input.periodLabel}`,
        line: {
          items: [
            {
              account: { id: config.bank_account_ns_id },
              [debitBank ? 'debit' : 'credit']: amount,
              memo: `Amazon FBA reimbursements ${input.periodLabel}`,
            },
            {
              account: { id: config.writeoff_account_ns_id },
              [debitBank ? 'credit' : 'debit']: amount,
              memo: `Amazon FBA reimbursements ${input.periodLabel}`,
            },
          ],
        },
      })
    );
  } else {
    results.push({ step: 'journal', status: 'skipped' });
  }

  return results;
}
