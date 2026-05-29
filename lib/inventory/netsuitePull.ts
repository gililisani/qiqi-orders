/**
 * Pull an item's full inventory-affecting transaction history from NetSuite.
 *
 * SERVER-ONLY — uses createNetSuiteAPI() (OAuth secrets). Never import into a
 * 'use client' file.
 *
 * The query shape here is the one validated against the Phase 1 anchors
 * (COM0067 Ambix=2616 / Main=-22946 / Bio-Direct carries 932 into 2024;
 * BAS0009 = 0 suspects). Key rules, all empirically confirmed:
 *   - inventory-moving lines = transactionline.isinventoryaffecting = 'T'
 *     (NOT a transaction-type whitelist; this also correctly excludes the
 *      ~9,385 financial-only VendBill lines and COGS/GL lines)
 *   - signed inventory impact = transactionline.quantity AS-IS
 *   - transfers = two opposite-signed legs sharing transaction.id
 *   - dates are DD/MM from this account → normalizeNsDate()
 *   - opening(item,loc) = currentQOH - SUM(signed); final reconstructs to QOH
 */
import { createNetSuiteAPI, normalizeNsDate } from '@/lib/netsuite';
import type { LedgerTxn, OpeningBalance, TranType } from '@/lib/inventory/balanceEngine';

const NS_TO_TYPE: Record<string, TranType> = {
  ItemRcpt: 'IR',
  ItemShip: 'IF',
  CustInvc: 'IF', // an inventory-affecting invoice ships goods out
  InvTrnfr: 'IT',
  Build: 'BUILD',
  Unbuild: 'UNBUILD',
  InvAdjst: 'ADJ',
  VendBill: 'BILL',
};

export interface PulledItem {
  itemCode: string;
  nsItemId: string;
  itemName: string;
  itemType: string;
  transactions: LedgerTxn[];
  openings: OpeningBalance[];
  dateMin: string | null;
  dateMax: string | null;
}

const num = (v: unknown): number => {
  if (v == null || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export async function pullItemInventory(itemCode: string): Promise<PulledItem> {
  const ns = createNetSuiteAPI();
  const esc = itemCode.replace(/'/g, "''").toUpperCase();

  const itemRows = await ns.suiteQLPaged<any>(
    `SELECT id, itemid, displayname, BUILTIN.DF(itemtype) AS itype
       FROM item WHERE UPPER(itemid) = '${esc}'`,
  );
  if (!itemRows.length) throw new Error(`Item not found in NetSuite: ${itemCode}`);
  const nsItemId = String(itemRows[0].id);
  const itemName = itemRows[0].displayname ?? itemRows[0].itemid ?? itemCode;
  const itemType = itemRows[0].itype ?? '';

  // Inventory-affecting lines only. No transaction-type whitelist.
  const lines = await ns.suiteQLPaged<any>(
    `SELECT t.id AS tx_id, t.tranid AS doc, t.trandate, t.type AS ns_type,
            BUILTIN.DF(t.type) AS ns_type_name, t.memo AS tx_memo,
            tl.id AS line_id, tl.location, BUILTIN.DF(tl.location) AS loc_name,
            tl.quantity, tl.memo AS line_memo
       FROM transactionline tl
       JOIN transaction t ON t.id = tl.transaction
      WHERE tl.item = ${nsItemId}
        AND tl.isinventoryaffecting = 'T'
      ORDER BY t.trandate, t.id, tl.id`,
  );

  // Current quantity-on-hand per location — the ground-truth anchor.
  const qohRows = await ns.suiteQLPaged<any>(
    `SELECT il.location AS loc, BUILTIN.DF(il.location) AS loc_name,
            SUM(il.quantityonhand) AS qoh
       FROM inventorybalance il
      WHERE il.item = ${nsItemId}
      GROUP BY il.location, BUILTIN.DF(il.location)`,
  );

  const nameByLoc = new Map<string, string>();
  const qohByLoc = new Map<string, number>();
  for (const r of qohRows) {
    qohByLoc.set(String(r.loc), num(r.qoh) || 0);
    if (r.loc_name) nameByLoc.set(String(r.loc), r.loc_name);
  }

  const transactions: LedgerTxn[] = [];
  let dateMin: string | null = null;
  let dateMax: string | null = null;

  for (const r of lines) {
    const qty = num(r.quantity);
    if (!Number.isFinite(qty)) continue; // GL-only / no-quantity line
    const locId = r.location == null ? '(no location)' : String(r.location);
    if (r.loc_name) nameByLoc.set(locId, r.loc_name);
    const date = normalizeNsDate(r.trandate) || String(r.trandate);
    if (dateMin === null || date < dateMin) dateMin = date;
    if (dateMax === null || date > dateMax) dateMax = date;

    const isTransfer = r.ns_type === 'InvTrnfr';
    transactions.push({
      id: `${r.tx_id}-${r.line_id}`,
      nsTransactionId: String(r.tx_id),
      lineId: String(r.line_id),
      docNumber: r.doc ?? '',
      tranDate: date,
      tranType: NS_TO_TYPE[r.ns_type] ?? 'ADJ',
      nsType: r.ns_type_name ?? r.ns_type ?? null,
      locationNsId: locId,
      locationName: nameByLoc.get(locId) || locId,
      signedQty: qty,
      transferGroup: isTransfer ? String(r.doc ?? r.tx_id) : null,
      transferLeg: isTransfer ? (qty < 0 ? 'source' : 'dest') : null,
      memo: r.line_memo || r.tx_memo || undefined,
    });
  }

  // Per-location opening = currentQOH - SUM(signed pulled).
  const sumByLoc = new Map<string, number>();
  for (const t of transactions) {
    sumByLoc.set(t.locationNsId, (sumByLoc.get(t.locationNsId) ?? 0) + t.signedQty);
  }
  const allLocs = new Set<string>([...sumByLoc.keys(), ...qohByLoc.keys()]);
  const openings: OpeningBalance[] = [];
  for (const loc of allLocs) {
    const qoh = qohByLoc.get(loc) ?? 0;
    const sum = sumByLoc.get(loc) ?? 0;
    openings.push({
      locationNsId: loc,
      locationName: nameByLoc.get(loc) || loc,
      openingQty: qoh - sum,
      currentQoh: qoh,
    });
  }

  return { itemCode: itemCode.toUpperCase(), nsItemId, itemName, itemType, transactions, openings, dateMin, dateMax };
}
