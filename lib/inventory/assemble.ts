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
  subsidiary_name?: unknown;
}

export interface RawQoh {
  loc: unknown;
  loc_name?: unknown;
  qoh: unknown;
}

export interface LocationResidual {
  locationNsId: string;
  locationName: string;
  currentQoh: number;
  txSum: number; // sum of pulled signed transactions at this location
  residual: number; // currentQoh − txSum; nonzero = NS on-hand disagrees with its own tx history
}

export interface AssembledItem {
  transactions: LedgerTxn[];
  openings: OpeningBalance[];
  /** Per-location phantom residuals (NS on-hand vs transaction history). */
  residuals: LocationResidual[];
  dateMin: string | null;
  dateMax: string | null;
}

const num = (v: unknown): number => {
  if (v == null || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Optional measured-opening anchor (from an imported NetSuite snapshot).
 *  - cutoffDate: the snapshot's "as of" date (ISO).
 *  - openingByLocName: location NAME → on-hand at the cutoff.
 * When provided, the engine starts each location at its snapshot qty and
 * INCLUDES ONLY transactions dated AFTER the cutoff (the snapshot already
 * embodies everything on/before it). Without it, we zero-anchor (legacy).
 */
export interface OpeningAnchor {
  cutoffDate: string;
  openingByLocName: Map<string, number>; // key = location name
}

export function assembleItem(lines: RawTxnLine[], qohRows: RawQoh[], anchor?: OpeningAnchor): AssembledItem {
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
    // With a snapshot anchor, drop everything on/before the cutoff — the
    // snapshot already accounts for it. (dateMin/dateMax track only kept rows.)
    if (anchor && date <= anchor.cutoffDate) continue;
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
      subsidiaryName: (r.subsidiary_name as string) ?? null,
      chainPartnerTxId: null, // populated post-assembly by linkChains()
      chainRole: null,
    });
  }

  const sumByLoc = new Map<string, number>();
  for (const t of transactions) {
    sumByLoc.set(t.locationNsId, (sumByLoc.get(t.locationNsId) ?? 0) + t.signedQty);
  }
  const allLocs = new Set<string>([...sumByLoc.keys(), ...qohByLoc.keys()]);
  const openings: OpeningBalance[] = [];
  const residuals: LocationResidual[] = [];
  for (const loc of allLocs) {
    const qoh = qohByLoc.get(loc) ?? 0;
    const sum = sumByLoc.get(loc) ?? 0; // sum of KEPT transactions (post-cutoff if anchored)
    const locName = nameByLoc.get(loc) || loc;

    // OPENING:
    //  - With a snapshot anchor: the MEASURED on-hand at the cutoff (the only
    //    way to correctly place a residual in time — see FPS0017 vs FPS0028).
    //    Defaults to 0 if the snapshot has no row for this (item, location).
    //  - Without: zero-anchor (legacy), matching NetSuite's run-from-zero.
    const opening = anchor ? anchor.openingByLocName.get(locName) ?? 0 : 0;

    openings.push({
      locationNsId: loc,
      locationName: locName,
      openingQty: opening,
      currentQoh: qoh,
    });

    // Residual = NS current on-hand vs the reconstructed final (opening + Σkept).
    // With a correct snapshot this should be ~0; a nonzero value flags an
    // (item, location) whose on-hand still can't be reconciled (a real data
    // integrity issue, or a snapshot gap). Round 2dp to ignore float noise.
    const reconstructedFinal = opening + sum;
    const residual = Math.round((qoh - reconstructedFinal) * 100) / 100;
    if (residual !== 0) {
      residuals.push({
        locationNsId: loc,
        locationName: locName,
        currentQoh: qoh,
        txSum: sum,
        residual,
      });
    }
  }

  return { transactions, openings, residuals, dateMin, dateMax };
}
