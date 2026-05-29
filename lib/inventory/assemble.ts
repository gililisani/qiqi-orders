/**
 * Turn raw NetSuite rows (inventory-affecting transaction lines + QOH) into the
 * engine's LedgerTxn[] + OpeningBalance[]. Pure — no I/O.
 *
 * This is the single source of the validated normalization rules (see
 * netsuitePull.ts header): isinventoryaffecting lines already filtered upstream;
 * signed quantity as-is; transfers paired by transaction id; DD/MM dates
 * normalized; opening = currentQOH - SUM(signed). Used by both the per-item
 * pull and the catalog-wide worklist pull so the math can't diverge.
 */
import { normalizeNsDate } from '@/lib/netsuite';
import type { LedgerTxn, OpeningBalance, TranType } from '@/lib/inventory/balanceEngine';

const NS_TO_TYPE: Record<string, TranType> = {
  ItemRcpt: 'IR',
  ItemShip: 'IF',
  CustInvc: 'IF',
  InvTrnfr: 'IT',
  Build: 'BUILD',
  Unbuild: 'UNBUILD',
  InvAdjst: 'ADJ',
  VendBill: 'BILL',
};

export interface RawTxnLine {
  tx_id: unknown;
  doc: unknown;
  trandate: unknown;
  ns_type: unknown;
  ns_type_name?: unknown;
  tx_memo?: unknown;
  line_id: unknown;
  location: unknown;
  loc_name?: unknown;
  quantity: unknown;
  line_memo?: unknown;
}

export interface RawQoh {
  loc: unknown;
  loc_name?: unknown;
  qoh: unknown;
}

export interface AssembledItem {
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

export function assembleItem(lines: RawTxnLine[], qohRows: RawQoh[]): AssembledItem {
  const nameByLoc = new Map<string, string>();
  const qohByLoc = new Map<string, number>();
  for (const r of qohRows) {
    qohByLoc.set(String(r.loc), num(r.qoh) || 0);
    if (r.loc_name) nameByLoc.set(String(r.loc), String(r.loc_name));
  }

  const transactions: LedgerTxn[] = [];
  let dateMin: string | null = null;
  let dateMax: string | null = null;

  for (const r of lines) {
    const qty = num(r.quantity);
    if (!Number.isFinite(qty)) continue; // GL-only / no-quantity line
    const locId = r.location == null ? '(no location)' : String(r.location);
    if (r.loc_name) nameByLoc.set(locId, String(r.loc_name));
    const date = normalizeNsDate(r.trandate as any) || String(r.trandate);
    if (dateMin === null || date < dateMin) dateMin = date;
    if (dateMax === null || date > dateMax) dateMax = date;

    const isTransfer = r.ns_type === 'InvTrnfr';
    transactions.push({
      id: `${r.tx_id}-${r.line_id}`,
      nsTransactionId: String(r.tx_id),
      lineId: String(r.line_id),
      docNumber: r.doc == null ? '' : String(r.doc),
      tranDate: date,
      tranType: NS_TO_TYPE[String(r.ns_type)] ?? 'ADJ',
      nsType: (r.ns_type_name as string) ?? (r.ns_type as string) ?? null,
      nsTypeCode: r.ns_type == null ? null : String(r.ns_type),
      locationNsId: locId,
      locationName: nameByLoc.get(locId) || locId,
      signedQty: qty,
      transferGroup: isTransfer ? String(r.doc ?? r.tx_id) : null,
      transferLeg: isTransfer ? (qty < 0 ? 'source' : 'dest') : null,
      memo: (r.line_memo as string) || (r.tx_memo as string) || undefined,
    });
  }

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

  return { transactions, openings, dateMin, dateMax };
}
