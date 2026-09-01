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
import type { MonthReturns } from './returnsRestock';

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
  /** Physical customer returns for the month (API-prepared batches only). */
  returns?: MonthReturns;
}

export interface PushStepResult {
  step: 'cashSale' | 'cashRefund' | 'vendorBill' | 'billPayment' | 'journal' | 'returnsRestock';
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
  if (input.reimbursementTotal !== 0 || (input.returns?.restockLines?.length || 0) > 0) {
    need('writeoff_account_ns_id', 'Write-off account (620070)');
  }
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

  // Not every item is lot-tracked (e.g. KIT0034 is a non-lot assembly) —
  // NetSuite rejects an inventoryDetail on those. Only plan lots where the
  // item actually tracks them; non-lot lines get an empty plan (no detail).
  const flagRows = await ns.suiteQL<{ id: string; islotitem: string }>(
    `SELECT id, islotitem FROM item WHERE id IN (${itemIds.map((i) => Number(i)).join(', ')})`
  );
  const lotTracked = new Set(flagRows.filter((r) => r.islotitem === 'T').map((r) => String(r.id)));
  const lotItemIds = itemIds.filter((id) => lotTracked.has(String(id)));

  const rows = lotItemIds.length === 0 ? [] : await ns.suiteQL<{
    item: string;
    inventorynumber: string;
    quantityavailable: string;
  }>(
    `SELECT item, inventorynumber, quantityavailable
       FROM InventoryBalance
      WHERE location = ${Number(locationNsId)}
        AND quantityavailable > 0
        AND item IN (${lotItemIds.map((i) => Number(i)).join(', ')})`
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

  // Check month TOTALS per item first, so the error reports the real gap
  // ("month needs 18, only 17 available — short 1") instead of the misleading
  // per-line "need 1, only 0" that only shows once the pool is drained.
  const needByItem = new Map<string, { name: string; need: number }>();
  for (const line of saleLines) {
    if (!lotTracked.has(String(line.nsItemId))) continue;
    const entry = needByItem.get(line.nsItemId) || { name: line.nsItemName, need: 0 };
    entry.need += line.quantity;
    needByItem.set(line.nsItemId, entry);
  }
  const shortages: string[] = [];
  for (const [itemId, { name, need }] of needByItem) {
    const available = (pools.get(itemId) || []).reduce((s, lot) => s + lot.available, 0);
    if (available < need) {
      shortages.push(
        `${name}: this month sold ${need}, only ${available} available at the Amazon FBA location (short ${need - available})`
      );
    }
  }
  if (shortages.length > 0) {
    throw new Error(
      `Not enough lot-numbered inventory at the Amazon FBA location:\n${shortages.join('\n')}\n` +
      'Record the missing inbound shipment / returns in NetSuite (or fix item mapping) and retry. ' +
      'The drift panel on this page compares NetSuite against live Amazon stock.'
    );
  }

  const plan = new Map<number, LotAssignment[]>();
  saleLines.forEach((line, index) => {
    if (!lotTracked.has(String(line.nsItemId))) {
      plan.set(index, []); // non-lot item: no inventory detail on the line
      return;
    }
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
    // Totals were verified above, so every line must be satisfiable.
    plan.set(index, assignments);
  });
  return plan;
}

// ---------------------------------------------------------------------------
// Returns restock lot planning
// ---------------------------------------------------------------------------
/**
 * Pick the lot NAME each restocked item goes back into: the lot with the most
 * available stock at the FBA location, else the item's newest lot anywhere
 * (the location may have just run dry — which is exactly when returns matter).
 * Positive adjustments receive by lot NAME (receiptInventoryNumber).
 */
async function planRestockLots(
  ns: NetSuiteAPI,
  locationNsId: string,
  itemIds: string[]
): Promise<Map<string, string | null>> {
  const lotByItem = new Map<string, string | null>();
  if (itemIds.length === 0) return lotByItem;
  const ids = itemIds.map((i) => Number(i)).join(', ');

  const flagRows = await ns.suiteQL<{ id: string; islotitem: string }>(
    `SELECT id, islotitem FROM item WHERE id IN (${ids})`
  );
  for (const r of flagRows) {
    if (r.islotitem !== 'T') lotByItem.set(String(r.id), null); // non-lot: no detail needed
  }

  const atLocation = await ns.suiteQL<{ item: string; lotname: string; quantityavailable: string }>(
    `SELECT ib.item, inv.inventorynumber AS lotname, ib.quantityavailable
       FROM InventoryBalance ib
       JOIN inventorynumber inv ON inv.id = ib.inventorynumber
      WHERE ib.location = ${Number(locationNsId)} AND ib.item IN (${ids})
      ORDER BY ib.quantityavailable DESC`
  );
  for (const r of atLocation) {
    const key = String(r.item);
    if (!lotByItem.has(key) && r.lotname) lotByItem.set(key, r.lotname);
  }

  const unresolved = itemIds.filter((id) => !lotByItem.has(String(id)));
  if (unresolved.length > 0) {
    const latest = await ns.suiteQL<{ item: string; lotname: string }>(
      `SELECT inv.item, inv.inventorynumber AS lotname
         FROM inventorynumber inv
        WHERE inv.item IN (${unresolved.map((i) => Number(i)).join(', ')})
        ORDER BY inv.id DESC`
    );
    for (const r of latest) {
      const key = String(r.item);
      if (!lotByItem.has(key) && r.lotname) lotByItem.set(key, r.lotname);
    }
  }
  return lotByItem;
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

    const items: Record<string, unknown>[] = input.saleLines.map((line, index) => {
      const assignments = lotPlan.get(index) || [];
      return {
        item: { id: line.nsItemId },
        quantity: line.quantity,
        rate: line.unitPrice,
        description: line.orderId,
        // Only lot-tracked items may carry an inventory detail.
        ...(assignments.length > 0
          ? {
              inventoryDetail: {
                inventoryAssignment: {
                  items: assignments.map((a) => ({
                    issueInventoryNumber: { id: a.lotId },
                    quantity: a.quantity,
                  })),
                },
              },
            }
          : {}),
      };
    });

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
        // Without an explicit tranId NS assigns a bare check number ("1")
        // that is impossible to find later — stamp the period reference.
        tranId: payExternalId,
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

  // -- 6. Returns restock (sellable physical returns back into stock) --------
  const restockLines = input.returns?.restockLines?.filter((l) => l.nsItemId && l.quantity > 0) || [];
  if (restockLines.length > 0) {
    const lotByItem = await planRestockLots(
      ns,
      config.location_ns_id,
      restockLines.map((l) => l.nsItemId)
    );
    const missingLot = restockLines.filter(
      (l) => lotByItem.get(String(l.nsItemId)) === undefined
    );
    if (missingLot.length > 0) {
      throw new Error(
        `Returns restock: no lot found for ${missingLot.map((l) => l.nsItemName).join(', ')} — ` +
        'restock these manually in NetSuite, then push again (the adjustment is idempotent).'
      );
    }
    await ensureRecord(
      ns,
      results,
      'returnsRestock',
      'inventoryAdjustment',
      `AMAZON-FBA-RETSTK-${input.period}`,
      () =>
        ns.createRecord('inventoryAdjustment', {
          externalId: `AMAZON-FBA-RETSTK-${input.period}`,
          subsidiary: { id: config.subsidiary_ns_id },
          account: { id: config.writeoff_account_ns_id },
          adjLocation: { id: config.location_ns_id },
          tranDate: input.tranDate,
          memo: `Amazon FBA sellable customer returns ${input.periodLabel}`,
          ...classRef,
          inventory: {
            items: restockLines.map((line) => {
              const lotName = lotByItem.get(String(line.nsItemId));
              return {
                item: { id: line.nsItemId },
                location: { id: config.location_ns_id },
                adjustQtyBy: line.quantity,
                memo: `Returned orders: ${line.orderIds.join(', ')}`.slice(0, 999),
                ...(lotName
                  ? {
                      inventoryDetail: {
                        inventoryAssignment: {
                          items: [{ receiptInventoryNumber: lotName, quantity: line.quantity }],
                        },
                      },
                    }
                  : {}),
              };
            }),
          },
        })
    );
  } else {
    results.push({ step: 'returnsRestock', status: 'skipped' });
  }

  return results;
}
