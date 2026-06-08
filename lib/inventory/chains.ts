/**
 * Document-chain model. Pure — no I/O.
 *
 * This account has NO Transfer Order documents and no `createdfrom` column
 * (verified by probe, 2026-06). Intercompany transfers surface as a 2-document
 * pair — Item Fulfillment (out) + Item Receipt (in) — linked via
 * `nexttransactionlink` with linktype 'TOrdCost'. We pull those pairs and stamp
 * each leg's transaction with chainPartnerTxId + chainRole.
 *
 * Chain types:
 *   - Domestic Inventory Transfer (InvTrnfr): single doc, 2 opposite-signed legs
 *     sharing transaction.id. Handled by the existing transferGroup logic.
 *   - Intercompany transfer: IF + IR, two SEPARATE documents (different
 *     transaction ids). Detected here. "Intercompany" = the IF and IR legs have
 *     DIFFERENT subsidiaries (iscrosssubtransaction is unreliable in this acct).
 *
 * Broken-chain detection (per spec Part E, adapted to the real 2-doc model):
 *   - IF and IR dated more than BROKEN_GAP_DAYS apart
 *   - IF and IR carry different quantities for the same item
 *   (TO-date vs IF-date is unrunnable — no TO document exists.)
 */
import type { LedgerTxn } from '@/lib/inventory/balanceEngine';

export const BROKEN_GAP_DAYS = 60;

export interface TOrdCostPair {
  ifTxId: string; // Item Fulfillment transaction internal id
  irTxId: string; // Item Receipt transaction internal id
}

/**
 * Stamp chain linkage onto transactions in place-ish (returns a new array).
 * `pairs` come from nexttransactionlink (linktype='TOrdCost'): previousdoc=IF,
 * nextdoc=IR. Only the legs we actually have in this item's transactions get
 * stamped; the partner may live under a different item but same tx id.
 */
export function linkChains(txns: LedgerTxn[], pairs: TOrdCostPair[]): LedgerTxn[] {
  const irByIf = new Map<string, string>();
  const ifByIr = new Map<string, string>();
  for (const p of pairs) {
    irByIf.set(p.ifTxId, p.irTxId);
    ifByIr.set(p.irTxId, p.ifTxId);
  }
  return txns.map((t) => {
    if (t.nsTypeCode === 'ItemShip' && irByIf.has(t.nsTransactionId)) {
      return { ...t, chainRole: 'if' as const, chainPartnerTxId: irByIf.get(t.nsTransactionId)! };
    }
    if (t.nsTypeCode === 'ItemRcpt' && ifByIr.has(t.nsTransactionId)) {
      return { ...t, chainRole: 'ir' as const, chainPartnerTxId: ifByIr.get(t.nsTransactionId)! };
    }
    return t;
  });
}

export interface IntercompanyChain {
  ifTxId: string;
  irTxId: string;
  ifDoc: string;
  irDoc: string;
  ifDate: string;
  irDate: string;
  ifSubsidiary: string | null;
  irSubsidiary: string | null;
  sourceLocationNsId: string; // IF leg (outbound)
  sourceLocationName: string;
  destLocationNsId: string; // IR leg (inbound)
  destLocationName: string;
  qtyOut: number; // magnitude shipped (this item)
  qtyIn: number; // magnitude received (this item)
  isIntercompany: boolean; // subsidiaries differ
  broken: boolean;
  brokenReason: string | null;
}

function daysApart(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000));
}

/**
 * Build the intercompany chains present in ONE item's transactions. A chain is
 * formed when an IF leg references an IR partner (chainPartnerTxId) and both
 * legs touch THIS item. Returns one chain per IF/IR pair, with broken-chain
 * diagnostics. Detection of "intercompany" = differing subsidiary.
 */
export function buildItemChains(txns: LedgerTxn[]): IntercompanyChain[] {
  const ifLegs = txns.filter((t) => t.chainRole === 'if');
  const irByTxId = new Map<string, LedgerTxn>();
  for (const t of txns) if (t.chainRole === 'ir') irByTxId.set(t.nsTransactionId, t);

  const chains: IntercompanyChain[] = [];
  for (const ifLeg of ifLegs) {
    const irLeg = ifLeg.chainPartnerTxId ? irByTxId.get(ifLeg.chainPartnerTxId) : undefined;
    if (!irLeg) continue; // partner leg not for this item — skip (chain spans items)

    const qtyOut = Math.abs(ifLeg.signedQty);
    const qtyIn = Math.abs(irLeg.signedQty);
    const isIntercompany =
      !!ifLeg.subsidiaryName && !!irLeg.subsidiaryName && ifLeg.subsidiaryName !== irLeg.subsidiaryName;

    const reasons: string[] = [];
    const gap = daysApart(ifLeg.tranDate, irLeg.tranDate);
    if (gap > BROKEN_GAP_DAYS) reasons.push(`IF dated ${ifLeg.tranDate}, IR dated ${irLeg.tranDate}, ${gap} days apart`);
    if (qtyOut !== qtyIn) reasons.push(`IF qty ${qtyOut} ≠ IR qty ${qtyIn}`);

    chains.push({
      ifTxId: ifLeg.nsTransactionId,
      irTxId: irLeg.nsTransactionId,
      ifDoc: ifLeg.docNumber,
      irDoc: irLeg.docNumber,
      ifDate: ifLeg.tranDate,
      irDate: irLeg.tranDate,
      ifSubsidiary: ifLeg.subsidiaryName ?? null,
      irSubsidiary: irLeg.subsidiaryName ?? null,
      sourceLocationNsId: ifLeg.locationNsId,
      sourceLocationName: ifLeg.locationName,
      destLocationNsId: irLeg.locationNsId,
      destLocationName: irLeg.locationName,
      qtyOut,
      qtyIn,
      isIntercompany,
      broken: reasons.length > 0,
      brokenReason: reasons.length > 0 ? reasons.join('; ') : null,
    });
  }
  return chains;
}

/** Find the chain (if any) that a given transaction id belongs to. */
export function chainForTx(chains: IntercompanyChain[], nsTransactionId: string): IntercompanyChain | undefined {
  return chains.find((c) => c.ifTxId === nsTransactionId || c.irTxId === nsTransactionId);
}
