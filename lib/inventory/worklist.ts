/**
 * Auto-recommendation engine — CHAIN-AWARE, with prerequisite resolution.
 *
 * HARD RULES (unchanged):
 *  - RULE 1 CLOSED PERIOD: never edit, and never propose a new date, before
 *    2024-01-01. BUG-2 scope: only negatives on/after 2024-01-01 are considered.
 *  - RULE 2 EDITABLE TYPES: a fix may only target Inventory Transfer /
 *    Inventory Adjustment / Item Receipt / Vendor Bill (raw nsTypeCode). Builds,
 *    Fulfillments, Invoices etc. are physical/commercial reality — never edited.
 *    EXCEPTION: an Item Fulfillment that is the source leg of an intercompany
 *    TOrdCost chain IS moved (date only) as part of editing that chain, because
 *    the chain is one logical transfer — but it always travels with its IR.
 *
 * CHAINS (probed model for this account):
 *  - Domestic Inventory Transfer (InvTrnfr): 1 doc, 2 legs sharing tx id.
 *  - Intercompany transfer: IF + IR, two docs linked via TOrdCost. Detected by
 *    differing subsidiary. Edited as a group (+ a manual "edit the TO in the
 *    NetSuite UI" instruction, since the TO isn't in our data).
 *
 * PREREQUISITE RESOLUTION (Part C, max depth 2):
 *  - A backdate is feasible only if the SOURCE location holds enough of the item
 *    on (new_date − 1). If short, look for ONE upstream inbound at the source to
 *    backdate (IR / IT-in / Build). A Build candidate also requires its consumed
 *    components to be present at the factory on (new_date − 1) — a cross-item
 *    check via the catalog context. Never recurse past that (depth-2 cap):
 *    if a component is short, report it and mark MANUAL.
 *
 * BUG-1: every ongoing negative window on/after 2024-01-01 produces a row — if
 * nothing resolves it, the row is MANUAL REVIEW with a reason, never dropped.
 */
import {
  computeLedger,
  applyChanges,
  simulateMany,
  type Ledger,
  type LedgerTxn,
  type OpeningBalance,
  type SimChange,
  type LocationLedger,
} from '@/lib/inventory/balanceEngine';
import { computeItemWindows, type NegativeWindow } from '@/lib/inventory/negativeWindows';
import { buildItemChains, chainForTx, type IntercompanyChain } from '@/lib/inventory/chains';

export const CLOSED_PERIOD_CUTOFF = '2024-01-01';
export const EDITABLE_NS_TYPES = new Set(['InvTrnfr', 'InvAdjst', 'ItemRcpt', 'VendBill']);

export const NS_TYPE_LABEL: Record<string, string> = {
  InvTrnfr: 'Inventory Transfer',
  InvAdjst: 'Inventory Adjustment',
  ItemRcpt: 'Item Receipt',
  VendBill: 'Bill',
  Build: 'Assembly Build',
  Unbuild: 'Assembly Unbuild',
  ItemShip: 'Item Fulfillment',
  CustInvc: 'Invoice',
  CashSale: 'Cash Sale',
  CustCred: 'Credit Memo',
  CustRfnd: 'Customer Refund',
};

export type RecommendationType =
  | 'Change date'
  | 'Reduce quantity'
  | 'Delete chain'
  | 'Create transfer'
  | 'Manual review'
  | 'Broken chain';

export type Category = 'CLEAN' | 'PARTIAL' | 'MANUAL' | 'CLOSED';
export type Tier = 1 | 2 | 3 | 4;

/**
 * How this row relates to the trusted NetSuite report feed:
 *  - 'confirmed' — ongoing negative the report agrees with; depth is the report's.
 *  - 'surfaced'  — report says negative but the engine had no case → shown as MANUAL.
 *  - 'unmatched' — engine ongoing negative the report has no row for (verify mapping).
 *  - null        — not reconciled (closed/historical row, or feed was unavailable).
 */
export type FeedStatus = 'confirmed' | 'surfaced' | 'unmatched';

export interface ItemMeta {
  itemCode: string;
  nsItemId: string | null;
  itemName: string | null;
}

/** One instruction in the EDITS REQUIRED list. `manual` steps are UI-only
 *  guidance (e.g. the Transfer Order), not simulated. */
export interface EditStep {
  order: number;
  manual?: boolean;
  doc: string | null; // null for pure-manual TO note
  docType: string | null; // raw NS type code or 'TransferOrder'
  action: string; // human text, e.g. "change date to 2024-05-01"
  detail?: string; // extra context (components verified, etc.)
}

/** A self-contained candidate fix (one option). */
export interface FixOption {
  label: string; // "Option A" etc.
  recommendationType: RecommendationType;
  category: Category; // CLEAN / PARTIAL / MANUAL
  edits: EditStep[];
  prerequisiteSummary: string; // "None" | "Backdate IR10246" | ...
  notes: string;
}

export interface WorklistRow {
  itemCode: string;
  nsItemId: string | null;
  itemName: string | null;
  locationNsId: string;
  locationName: string;
  depth: number;
  since: string | null;
  tier: Tier;

  /** Reconciliation with the trusted NetSuite report feed. Set during the
   *  catalog pull; undefined on engine-only computation (e.g. unit tests). */
  feedStatus?: FeedStatus | null;

  /** Trust of the historical depth against dated snapshots: true = verified,
   *  false = approximate (overlaps an unreconciled span), undefined = no dated
   *  snapshot covered this item. Mirrors the window's verified flag. */
  verified?: boolean;

  // Headline recommendation (the first/best option).
  recommendationType: RecommendationType;
  category: Category;
  editsRequired: EditStep[];
  prerequisiteSummary: string;
  isBrokenChain: boolean;
  notes: string;

  // Alternatives beyond the headline (Option B, C…). May be empty.
  options: FixOption[];

  // Back-compat fields still consumed by the per-item simulator deep-link + the
  // self-checks. For chain fixes this is the primary editable doc.
  suspectNsTransactionId: string | null;
  suspectDoc: string | null;
  suspectType: string | null; // raw NS type code
  suspectDate: string | null;
}

// ── Catalog context: lets the per-item engine reach OTHER items' ledgers for
//    cross-item component checks during prerequisite resolution. ───────────────
export interface ItemContext {
  meta: ItemMeta;
  txns: LedgerTxn[];
  openings: OpeningBalance[];
  ledger: Ledger;
  chains: IntercompanyChain[];
}
export interface BuildComponent {
  itemId: string;
  itemCode: string;
  qty: number; // magnitude consumed
  locationNsId: string; // factory
  locationName: string;
}
export interface CatalogContext {
  byItemId: Map<string, ItemContext>;
  // Build transaction id → component lines (negative, cross-item).
  componentsByBuildTxId: Map<string, BuildComponent[]>;
}

const fmt = (v: number) =>
  Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const isEditable = (t: { nsTypeCode?: string | null }) => !!t.nsTypeCode && EDITABLE_NS_TYPES.has(t.nsTypeCode);
const inScope = (d: string) => d >= CLOSED_PERIOD_CUTOFF;
function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/** A standalone marker the UI renders with an amber accent. Prefix lets the UI
 *  split it out of the notes string without coupling to wording. */
export const BOUNDARY_WARN_PREFIX = '⚠️ CLOSED-PERIOD BOUNDARY: ';

/**
 * When a fix backdates a transaction to EXACTLY the closed-period cutoff and the
 * original was dated >14 days later, the "clean" math may be masking pre-2024
 * damage. Returns a warning string to append, or '' if not applicable.
 */
function boundaryWarning(originalDate: string, newDate: string): string {
  if (newDate !== CLOSED_PERIOD_CUTOFF) return '';
  if (daysBetween(newDate, originalDate) <= 14) return '';
  return (
    ` ${BOUNDARY_WARN_PREFIX}This fix backdates a transaction (originally ${originalDate}) to the closed-period boundary (${CLOSED_PERIOD_CUTOFF}). ` +
    'Verify that 2024-01-01 reflects the actual physical date of the inventory movement before executing. ' +
    'If goods physically arrived later, this fix misrepresents timing and the underlying negative likely reflects pre-2024 damage that requires a different approach (catch-up adjustment, not retroactive edit).'
  );
}

/** Carried balance at a location at END of `date` (opening if no prior activity). */
function balanceAsOf(lane: LocationLedger | undefined, date: string): number {
  if (!lane) return 0;
  let bal = lane.opening;
  for (const p of lane.eodTimeline) {
    if (p.date <= date) bal = p.eod;
    else break;
  }
  return bal;
}

export function computeWorklistForItem(
  meta: ItemMeta,
  transactions: LedgerTxn[],
  openings: OpeningBalance[],
  ledger: Ledger,
  windows: NegativeWindow[],
  ctx: CatalogContext,
): WorklistRow[] {
  const chains = buildItemChains(transactions);

  // Worklist covers EVERY in-scope negative window — ongoing AND closed — so it
  // matches Negatives History (no silent drops, BUG-1) and so the backdate-late-
  // receipt fix (which only applies to closed windows) is reachable. In-scope =
  // the window overlaps 2024+. A window that ORIGINATES pre-2024 is flagged
  // CLOSED (RULE 1: can't edit into a closed period) but still listed. Purely
  // pre-2024 windows (started AND ended before the cutoff) are out of scope.
  const inScopeWindows = windows.filter((w) => {
    if ((w.start ?? '') >= CLOSED_PERIOD_CUTOFF) return true; // starts in-scope
    // started pre-2024: keep only if still ongoing or recovered in-scope.
    return w.end === null || w.end >= CLOSED_PERIOD_CUTOFF;
  });

  const rows: WorklistRow[] = [];
  const coveredLocs = new Set<string>();

  for (const w of inScopeWindows) {
    coveredLocs.add(w.locationNsId);
    rows.push(recommendCase(meta, transactions, openings, ledger, w, chains, ctx));
  }

  // Surface BROKEN CHAINS even when they don't sit on a currently-negative
  // location — a structurally inconsistent intercompany transfer (e.g. FPS0016:
  // IF and IR >60 days apart) needs manual review regardless. One row per broken
  // chain, keyed on its destination location, deduped against rows already shown.
  for (const c of chains) {
    if (!c.broken) continue;
    if (c.ifDate < CLOSED_PERIOD_CUTOFF && c.irDate < CLOSED_PERIOD_CUTOFF) continue; // wholly pre-2024 → out of scope
    if (coveredLocs.has(c.destLocationNsId)) continue; // already represented by a negative-window row (which flags broken)
    coveredLocs.add(c.destLocationNsId);
    rows.push({
      itemCode: meta.itemCode,
      nsItemId: meta.nsItemId,
      itemName: meta.itemName,
      locationNsId: c.destLocationNsId,
      locationName: c.destLocationName,
      depth: 0, // not a depth-driven case
      since: c.ifDate,
      tier: 4,
      recommendationType: 'Broken chain',
      category: 'MANUAL',
      editsRequired: [],
      prerequisiteSummary: 'None',
      isBrokenChain: true,
      notes: `BROKEN CHAIN: intercompany transfer ${c.ifDoc} (${c.ifDate}) → ${c.irDoc} (${c.irDate}) — ${c.brokenReason}. Manual review required.`,
      options: [],
      suspectNsTransactionId: null,
      suspectDoc: c.ifDoc,
      suspectType: 'ItemShip',
      suspectDate: null,
    });
  }

  return rows;
}

/** A negative case scoped to ONE window (a location can have several). */
interface WindowTarget {
  locationNsId: string;
  locationName: string;
  depth: number; // window's deepest EOD (negative)
  deepestDate: string;
  trigger: string; // window start
  windowEnd: string | null; // null = ongoing; else the recovery date (exclusive)
}

function targetForWindow(lane: LocationLedger | undefined, w: NegativeWindow): WindowTarget {
  // Deepest EOD date WITHIN this window.
  let deepestDate = w.start;
  let deepest = 0;
  if (lane) {
    for (const p of lane.eodTimeline) {
      if (p.date < w.start) continue;
      if (w.end !== null && p.date >= w.end) break;
      if (p.eod < deepest) {
        deepest = p.eod;
        deepestDate = p.date;
      }
    }
  }
  return {
    locationNsId: w.locationNsId,
    locationName: w.locationName,
    depth: deepest < 0 ? deepest : w.minBalance,
    deepestDate,
    trigger: w.start,
    windowEnd: w.end,
  };
}

function baseRow(meta: ItemMeta, t: WindowTarget, w: NegativeWindow): Omit<WorklistRow,
  'recommendationType' | 'category' | 'editsRequired' | 'prerequisiteSummary' | 'isBrokenChain' |
  'notes' | 'options' | 'suspectNsTransactionId' | 'suspectDoc' | 'suspectType' | 'suspectDate'> {
  return {
    itemCode: meta.itemCode,
    nsItemId: meta.nsItemId,
    itemName: meta.itemName,
    locationNsId: t.locationNsId,
    locationName: t.locationName,
    depth: t.depth,
    since: w.start,
    tier: w.tier as Tier,
    verified: w.verified,
  };
}

function recommendCase(
  meta: ItemMeta,
  txns: LedgerTxn[],
  openings: OpeningBalance[],
  ledger: Ledger,
  w: NegativeWindow,
  chains: IntercompanyChain[],
  ctx: CatalogContext,
): WorklistRow {
  const lane = ledger.byLocation[w.locationNsId];
  const target = targetForWindow(lane, w);
  const base = baseRow(meta, target, w);
  const trigger = w.start;
  const neg = { locationNsId: target.locationNsId, locationName: target.locationName }; // for message text

  const manual = (
    recType: RecommendationType,
    category: Category,
    notes: string,
    isBroken = false,
  ): WorklistRow => ({
    ...base,
    recommendationType: recType,
    category,
    editsRequired: [],
    prerequisiteSummary: 'None',
    isBrokenChain: isBroken,
    notes,
    options: [],
    suspectNsTransactionId: null,
    suspectDoc: null,
    suspectType: null,
    suspectDate: null,
  });

  // RULE 1 — originates pre-2024.
  if (trigger < CLOSED_PERIOD_CUTOFF) {
    return manual(
      'Manual review',
      'CLOSED',
      `${neg.locationName} is negative but the window starts ${trigger} (pre-2024, closed period). Any fix would require editing into a closed period — out of scope. Resolve via the accounting catch-up.`,
    );
  }

  // Broken-chain guard: if any chain touching this location is broken, surface it.
  const brokenHere = chains.find(
    (c) => c.broken && (c.sourceLocationNsId === neg.locationNsId || c.destLocationNsId === neg.locationNsId),
  );
  if (brokenHere) {
    return manual(
      'Broken chain',
      'MANUAL',
      `BROKEN CHAIN: intercompany transfer ${brokenHere.ifDoc} → ${brokenHere.irDoc} — ${brokenHere.brokenReason}. Manual review required before any inventory fix.`,
      true,
    );
  }

  // Collect candidate options, each fully simulated. `diagnostics` captures
  // rejected-alternative notes (e.g. a component-short assembly prerequisite).
  const diagnostics: string[] = [];
  const options = buildOptions(meta, txns, openings, ledger, target, w, chains, ctx, diagnostics);

  if (options.length === 0) {
    const driver = lane?.rows.find((r) => r.suspect);
    const driverNote = driver
      ? ` Driver: ${driver.docNumber} (${NS_TYPE_LABEL[driver.nsTypeCode ?? ''] ?? driver.tranType}).`
      : '';
    const diag = diagnostics.length ? ` ${diagnostics.join(' ')}` : '';
    return manual(
      'Manual review',
      'MANUAL',
      `No editable transfer/receipt/adjustment/bill on/after 2024-01-01 (with a feasible backdate) resolves ${neg.locationName}.${driverNote}${diag} Likely needs a new inventory adjustment — manual judgment.`,
    );
  }

  // Rank: CLEAN before PARTIAL; within that, fewer edits, then lower priority idx.
  options.sort(
    (a, b) =>
      catRank(a.category) - catRank(b.category) ||
      a.edits.length - b.edits.length ||
      a._priority - b._priority,
  );
  const head = options[0];
  const primaryEdit = head.edits.find((e) => !e.manual && e.doc);
  const diagNote = diagnostics.length ? ` ${diagnostics.join(' ')}` : '';

  return {
    ...base,
    recommendationType: head.recommendationType,
    category: head.category,
    editsRequired: head.edits,
    prerequisiteSummary: head.prerequisiteSummary,
    isBrokenChain: false,
    notes: head.notes + diagNote,
    options: options.slice(1).map(stripInternal),
    suspectNsTransactionId: head._primaryTxId,
    suspectDoc: primaryEdit?.doc ?? null,
    suspectType: primaryEdit?.docType ?? null,
    suspectDate: head._primaryNewDate,
  };
}

const catRank = (c: Category) => (c === 'CLEAN' ? 0 : c === 'PARTIAL' ? 1 : 2);

// Internal option carries extra fields used for ranking / back-compat.
interface InternalOption extends FixOption {
  _priority: number;
  _primaryTxId: string | null;
  _primaryNewDate: string | null;
}
function stripInternal(o: InternalOption): FixOption {
  const { _priority, _primaryTxId, _primaryNewDate, ...rest } = o;
  return rest;
}

/**
 * Build every viable fix option for a case. Each is simulated across the full
 * timeline (including any chain partner legs + prerequisites) and classified.
 */
function buildOptions(
  meta: ItemMeta,
  txns: LedgerTxn[],
  openings: OpeningBalance[],
  ledger: Ledger,
  target: WindowTarget,
  w: NegativeWindow,
  chains: IntercompanyChain[],
  ctx: CatalogContext,
  diagnostics: string[],
): InternalOption[] {
  const locId = target.locationNsId;
  const neg = { locationName: target.locationName };
  const lane = ledger.byLocation[locId];
  if (!lane) return [];
  const trigger = w.start;
  const eodByDate = new Map(lane.eodTimeline.map((p) => [p.date, p.eod]));
  const opts: InternalOption[] = [];

  // "Resolved" is WINDOW-scoped: after the fix, the location has no negative EOD
  // within THIS window's date span [trigger, windowEnd). Other windows on the
  // same location (different time) are separate cases. NEW PROBLEMS are still
  // judged globally (a fix must not create a negative anywhere).
  const windowResolved = (changed: LedgerTxn[]): boolean => {
    const lg = computeLedger(changed, openings);
    const lane2 = lg.byLocation[locId];
    if (!lane2) return true;
    for (const p of lane2.eodTimeline) {
      if (p.date < trigger) continue;
      if (target.windowEnd !== null && p.date >= target.windowEnd) break;
      if (p.eod < 0) return false;
    }
    return true;
  };

  const classify = (changes: SimChange[]): { category: Category; resolved: boolean; newProblemNote: string } => {
    const changed = applyChanges(txns, changes);
    const resolved = windowResolved(changed);
    const res = simulateMany(txns, openings, changes);
    const np = res.delta.newProblem;
    const newProblemNote = np
      .map((n) => `${fmt(n.depth)} at ${n.locationName}${n.spans[0] ? ` from ${n.spans[0].from}` : ''}`)
      .join('; ');
    const category: Category = !resolved ? 'MANUAL' : np.length === 0 ? 'CLEAN' : 'PARTIAL';
    return { category, resolved, newProblemNote };
  };

  for (const r of lane.rows) {
    // ── Editable OUTBOUND that contributed to the shortage ──────────────────
    if (isEditable(r) && inScope(r.tranDate) && r.signedQty < 0 && r.tranDate <= target.deepestDate) {
      const mag = Math.abs(r.signedQty);
      const eod = eodByDate.get(r.tranDate) ?? 0;
      const reduceTo = mag + eod;
      if (reduceTo > 0 && reduceTo < mag) {
        const { category, resolved, newProblemNote } = classify([
          { kind: 'changeQty', nsTransactionId: r.nsTransactionId, newQty: reduceTo },
        ]);
        if (resolved)
          opts.push(mkOption('Reduce quantity', category, 10, r.nsTransactionId, null, [
            edit(1, r.docNumber, r.nsTypeCode, `reduce quantity ${fmt(mag)} → ${fmt(reduceTo)}`),
          ], 'None', resolved, newProblemNote, neg));
      }
      // delete (chain-aware)
      {
        const chain = chainForTx(chains, r.nsTransactionId);
        const changes: SimChange[] = chain
          ? [{ kind: 'delete', nsTransactionId: chain.ifTxId }, { kind: 'delete', nsTransactionId: chain.irTxId }]
          : [{ kind: 'delete', nsTransactionId: r.nsTransactionId }];
        const { category, resolved, newProblemNote } = classify(changes);
        if (resolved)
          opts.push(mkOption('Delete chain', category, 40, r.nsTransactionId, null,
            chain ? chainDeleteEdits(chain) : [edit(1, r.docNumber, r.nsTypeCode, 'delete transaction')],
            chain ? 'Intercompany chain (IF+IR)' : 'None', resolved, newProblemNote, neg));
      }
    }

    // ── INBOUND dated after the trigger → candidate to backdate earlier ──────
    // Eligible: editable Item Receipt / Inventory-Transfer-in, OR the IR leg of
    // an intercompany chain (the chain moves as a group).
    const chain = chainForTx(chains, r.nsTransactionId);
    const isChainInbound = !!chain && chain.irTxId === r.nsTransactionId && chain.destLocationNsId === locId;
    const isEditableInbound = isEditable(r) && (r.nsTypeCode === 'ItemRcpt' || r.nsTypeCode === 'InvTrnfr');
    if (r.signedQty > 0 && r.tranDate > trigger && (isChainInbound || isEditableInbound)) {
      const newDate = trigger; // arrive on the day of the shortage → EOD covers it
      if (!inScope(newDate)) continue;

      const built = buildBackdateOption(meta, txns, openings, ledger, neg, r, chain, newDate, ctx, classify, diagnostics);
      if (built) opts.push(built);
    }
  }

  // ── CREATE_TRANSFER fallback (Part A from prior round) — only if nothing CLEAN
  //    yet. Most invasive: invents a record. ───────────────────────────────────
  if (!opts.some((o) => o.category === 'CLEAN')) {
    const requiredQty = Math.abs(eodByDate.get(trigger) ?? target.depth);
    if (requiredQty > 0) {
      let best: { lane: LocationLedger; surplus: number } | null = null;
      for (const src of Object.values(ledger.byLocation)) {
        if (src.locationNsId === locId || src.rows.length === 0) continue;
        const surplus = balanceAsOf(src, trigger);
        if (surplus < requiredQty) continue;
        const { resolved, category } = classify([
          { kind: 'createTransfer', source: src.locationNsId, sourceName: src.locationName, dest: locId, destName: neg.locationName, qty: requiredQty, date: trigger },
        ]);
        if (resolved && category === 'CLEAN' && (!best || surplus > best.surplus)) best = { lane: src, surplus };
      }
      if (best) {
        opts.push(mkOption('Create transfer', 'CLEAN', 60, null, trigger, [
          edit(1, null, 'InvTrnfr', `create Inventory Transfer ${best.lane.locationName} → ${neg.locationName}, ${fmt(requiredQty)}, dated ${trigger}`,
            `source has end-of-day surplus of ${fmt(best.surplus)} on ${trigger}`),
        ], 'None', true, '', neg));
      }
    }
  }

  return opts;
}

/** Build a CHANGE_DATE-earlier option, resolving source feasibility + prereqs. */
function buildBackdateOption(
  meta: ItemMeta,
  txns: LedgerTxn[],
  openings: OpeningBalance[],
  ledger: Ledger,
  neg: { locationName: string },
  inbound: LedgerTxn,
  chain: IntercompanyChain | undefined,
  newDate: string,
  ctx: CatalogContext,
  classify: (c: SimChange[]) => { category: Category; resolved: boolean; newProblemNote: string },
  diagnostics: string[],
): InternalOption | null {
  const moveQty = Math.abs(inbound.signedQty);
  // Primary changes: move the inbound (and, for a chain, its IF source leg) to newDate.
  const primaryChanges: SimChange[] = chain
    ? [
        { kind: 'changeDate', nsTransactionId: chain.ifTxId, newDate },
        { kind: 'changeDate', nsTransactionId: chain.irTxId, newDate },
      ]
    : [{ kind: 'changeDate', nsTransactionId: inbound.nsTransactionId, newDate }];

  // SOURCE feasibility — the location the goods ship FROM must hold moveQty on
  // (newDate − 1). For a chain that's the IF source location; for a domestic IT
  // inbound, the source is the IT's other (negative) leg location.
  const sourceLocId = chain ? chain.sourceLocationNsId : domesticTransferSource(txns, inbound);
  const prereqEdits: EditStep[] = [];
  let prereqSummary = 'None';
  let prereqChanges: SimChange[] = [];

  if (sourceLocId) {
    const srcLane = ledger.byLocation[sourceLocId];
    const dayBefore = shiftDay(newDate, -1);
    const srcBal = balanceAsOf(srcLane, dayBefore);
    if (srcBal < moveQty) {
      const shortfall = moveQty - srcBal;
      // Look for ONE upstream inbound at the source to backdate to newDate.
      const prereq = findUpstreamPrereq(meta, ledger, sourceLocId, newDate, shortfall, ctx, diagnostics);
      if (!prereq) {
        // Can't make it feasible — diagnostics already captured any near-miss.
        return null;
      }
      prereqChanges = prereq.changes;
      prereqEdits.push(...prereq.edits);
      prereqSummary = prereq.summary;
    }
  }

  const allChanges = [...prereqChanges, ...primaryChanges];
  const { category, resolved, newProblemNote } = classify(allChanges);
  if (!resolved) return null;

  // Assemble EDITS REQUIRED: prerequisite first, then (TO note for chains), then legs.
  const edits: EditStep[] = [];
  let order = 1;
  for (const e of prereqEdits) edits.push({ ...e, order: order++ });
  if (chain) {
    edits.push({
      order: order++,
      manual: true,
      doc: null,
      docType: 'TransferOrder',
      action: `In the NetSuite UI: open ${chain.ifDoc}, find the Transfer Order it was Created From, and change its date to ${newDate}`,
      detail: 'The Transfer Order is not in our data — locate it via the IF in NetSuite.',
    });
    edits.push({ order: order++, doc: chain.ifDoc, docType: 'ItemShip', action: `change date to ${newDate}` });
    edits.push({ order: order++, doc: chain.irDoc, docType: 'ItemRcpt', action: `change date to ${newDate}` });
  } else {
    edits.push({ order: order++, doc: inbound.docNumber, docType: inbound.nsTypeCode ?? null, action: `change date to ${newDate}` });
  }

  const warn = boundaryWarning(inbound.tranDate, newDate);
  const notes =
    (category === 'CLEAN'
      ? `Backdate ${chain ? `chain ${chain.ifDoc}/${chain.irDoc}` : inbound.docNumber} to ${newDate} resolves ${neg.locationName}. ${prereqSummary === 'None' ? 'Source had enough stock on the new date.' : `Requires prerequisite: ${prereqSummary}.`} No new negatives anywhere through end of data.`
      : `Backdate resolves ${neg.locationName} but would create ${newProblemNote}.`) + warn;

  return mkOptionRaw({
    recommendationType: 'Change date',
    category,
    edits,
    prerequisiteSummary: prereqSummary,
    notes,
    _priority: prereqChanges.length ? 25 : 20,
    _primaryTxId: chain ? chain.irTxId : inbound.nsTransactionId,
    _primaryNewDate: newDate,
  });
}

/** The source (negative-leg) location of a domestic Inventory Transfer, given
 *  its inbound (positive) leg. Both legs share the nsTransactionId. */
function domesticTransferSource(txns: LedgerTxn[], inbound: LedgerTxn): string | null {
  if (inbound.nsTypeCode !== 'InvTrnfr') return null;
  const other = txns.find((t) => t.nsTransactionId === inbound.nsTransactionId && t.signedQty < 0);
  return other?.locationNsId ?? null;
}

/**
 * Find ONE upstream inbound at `sourceLocId` that could be backdated to newDate
 * to close `shortfall`. Eligible: Item Receipt, Inventory-Transfer-in, or an
 * Assembly Build producing the item at that location. Build candidates require a
 * component check (depth-2 cap, no further recursion).
 */
function findUpstreamPrereq(
  meta: ItemMeta,
  ledger: Ledger,
  sourceLocId: string,
  newDate: string,
  shortfall: number,
  ctx: CatalogContext,
  diagnostics: string[],
): { changes: SimChange[]; edits: EditStep[]; summary: string } | null {
  const srcLane = ledger.byLocation[sourceLocId];
  if (!srcLane) return null;
  // Candidate inbounds at the source, currently dated AFTER newDate, qty >= shortfall.
  const candidates = srcLane.rows
    .filter((r) => r.signedQty > 0 && r.tranDate > newDate && Math.abs(r.signedQty) >= shortfall)
    .sort((a, b) => a.tranDate.localeCompare(b.tranDate)); // earliest first

  for (const c of candidates) {
    if (!inScope(newDate)) return null;
    // Editable inbound (IR / IT-in): straightforward backdate.
    if (c.nsTypeCode === 'ItemRcpt' || c.nsTypeCode === 'InvTrnfr') {
      return {
        changes: [{ kind: 'changeDate', nsTransactionId: c.nsTransactionId, newDate }],
        edits: [edit(0, c.docNumber, c.nsTypeCode, `change date to ${newDate}`, 'prerequisite: makes source stock available in time')],
        summary: `Backdate ${c.docNumber}`,
      };
    }
    // Assembly Build producing the item at the source → component check.
    if (c.nsTypeCode === 'Build') {
      const comps = ctx.componentsByBuildTxId.get(c.nsTransactionId) ?? [];
      const dayBefore = shiftDay(newDate, -1);
      const shortComps: string[] = [];
      const okComps: string[] = [];
      for (const comp of comps) {
        const compCtx = ctx.byItemId.get(comp.itemId);
        const compLane = compCtx?.ledger.byLocation[comp.locationNsId];
        const bal = balanceAsOf(compLane, dayBefore);
        if (bal >= comp.qty) okComps.push(`${comp.itemCode} ✓`);
        else shortComps.push(`${comp.itemCode} short ${fmt(comp.qty - bal)} (has ${fmt(bal)}, needs ${fmt(comp.qty)})`);
      }
      if (shortComps.length === 0) {
        return {
          changes: [{ kind: 'changeDate', nsTransactionId: c.nsTransactionId, newDate }],
          edits: [edit(0, c.docNumber, 'Build', `change date to ${newDate}`, `prerequisite assembly; components OK on ${dayBefore}: ${okComps.join(', ')}`)],
          summary: `Backdate ${c.docNumber} + components verified`,
        };
      }
      // Component short → depth-2 cap: do NOT recurse. Record the diagnostic so
      // the user sees why this alternative was rejected, then try next candidate.
      diagnostics.push(
        `Alternative considered: backdate ${c.docNumber} to ${newDate} — REJECTED because ${shortComps.join('; ')}.`,
      );
    }
  }
  return null;
}

// ── small builders ───────────────────────────────────────────────────────────
function edit(
  order: number,
  doc: string | null | undefined,
  docType: string | null | undefined,
  action: string,
  detail?: string,
): EditStep {
  return { order, doc: doc ?? null, docType: docType ?? null, action, detail };
}
function chainDeleteEdits(chain: IntercompanyChain): EditStep[] {
  return [
    { order: 1, manual: true, doc: null, docType: 'TransferOrder', action: `In the NetSuite UI: open ${chain.ifDoc}, find its Transfer Order, and delete it`, detail: 'TO not in our data.' },
    { order: 2, doc: chain.ifDoc, docType: 'ItemShip', action: 'delete' },
    { order: 3, doc: chain.irDoc, docType: 'ItemRcpt', action: 'delete' },
  ];
}
function mkOption(
  recType: RecommendationType,
  category: Category,
  priority: number,
  primaryTxId: string | null,
  primaryNewDate: string | null,
  edits: EditStep[],
  prereq: string,
  resolved: boolean,
  newProblemNote: string,
  neg: { locationName: string },
): InternalOption {
  const notes =
    category === 'CLEAN'
      ? `Resolves ${neg.locationName}. No new negatives anywhere through end of data.`
      : `Resolves ${neg.locationName} but would create ${newProblemNote}.`;
  return mkOptionRaw({ recommendationType: recType, category, edits, prerequisiteSummary: prereq, notes, _priority: priority, _primaryTxId: primaryTxId, _primaryNewDate: primaryNewDate });
}
function mkOptionRaw(o: Omit<InternalOption, 'label'>): InternalOption {
  return { label: '', ...o };
}

/**
 * Hard self-checks (Part F). Returns violation lists — all must be empty.
 */
export function validateWorklist(rows: WorklistRow[]): {
  nonEditable: WorklistRow[];
  closedPeriod: WorklistRow[];
  prereqPreCutoff: WorklistRow[];
  incompleteChain: WorklistRow[];
} {
  const nonEditable: WorklistRow[] = [];
  const closedPeriod: WorklistRow[] = [];
  const prereqPreCutoff: WorklistRow[] = [];
  const incompleteChain: WorklistRow[] = [];

  for (const r of rows) {
    for (const e of r.editsRequired) {
      if (e.manual) continue; // manual TO instructions aren't simulated edits
      // Editable-type check: an ItemShip is only allowed as part of a chain that
      // also includes its ItemRcpt.
      if (e.docType === 'ItemShip') {
        const hasIR = r.editsRequired.some((x) => x.docType === 'ItemRcpt');
        if (!hasIR) incompleteChain.push(r);
      } else if (e.docType && e.docType !== 'ItemRcpt' && e.docType !== 'Build' && !EDITABLE_NS_TYPES.has(e.docType)) {
        // Build appears only as a prerequisite (allowed); everything else must be editable.
        nonEditable.push(r);
      }
    }
    // Date checks: any explicit "to <date>" must be >= cutoff.
    for (const e of r.editsRequired) {
      const m = e.action.match(/to (\d{4}-\d{2}-\d{2})/);
      if (m && m[1] < CLOSED_PERIOD_CUTOFF) {
        if (e.detail?.includes('prerequisite')) prereqPreCutoff.push(r);
        else closedPeriod.push(r);
      }
    }
    if (r.suspectDate && r.suspectDate < CLOSED_PERIOD_CUTOFF) closedPeriod.push(r);
  }
  return { nonEditable, closedPeriod, prereqPreCutoff, incompleteChain };
}
