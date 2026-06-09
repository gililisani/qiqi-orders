/**
 * Compute the catalog-wide worklist. SERVER-ONLY.
 *
 * Pulls the entire inventory-affecting ledger for all Inventory Items +
 * Assemblies, plus the data needed for chain-aware recommendations:
 *   - each line's owning subsidiary (intercompany detection)
 *   - TOrdCost IF→IR links (nexttransactionlink) — the 2-doc intercompany model
 *   - assembly Build component lines (for prerequisite component checks)
 * Groups by item in memory, builds a CatalogContext (so prerequisite resolution
 * can reach other items' ledgers), and runs the recommendation engine per item.
 */
import { createNetSuiteAPI } from '@/lib/netsuite';
import { computeLedger } from '@/lib/inventory/balanceEngine';
import { assembleItem, type RawTxnLine, type RawQoh, type OpeningAnchor } from '@/lib/inventory/assemble';
import { resolveOpeningAnchor } from '@/lib/inventory/asOfAnchor';
import { readAllDatedSnapshots, buildDatedAnchor } from '@/lib/inventory/datedSnapshots';
import {
  computeWorklistForItem,
  type WorklistRow,
  type ItemMeta,
  type CatalogContext,
  type ItemContext,
  type BuildComponent,
} from '@/lib/inventory/worklist';
import { computeItemWindows, type NegativeWindow } from '@/lib/inventory/negativeWindows';
import { linkChains, buildItemChains, type TOrdCostPair } from '@/lib/inventory/chains';
import type { LocationResidual } from '@/lib/inventory/assemble';
import { fetchStockMatrix, type StockRow } from '@/lib/inventory/webQuery';
import {
  reconcileWorklistWithFeed,
  normalizeLocationName,
  type ReconcileSummary,
} from '@/lib/inventory/feedReconcile';

export interface WorklistComputation {
  rows: WorklistRow[];
  windows: NegativeWindow[];
  residuals: (LocationResidual & { itemCode: string; nsItemId: string | null; itemName: string | null })[];
  stats: {
    itemsScanned: number;
    itemsWithLines: number;
    cases: number;
    cleanCount: number;
    windowCount: number;
    chainPairs: number;
    residualItems: number; // items where NS on-hand disagrees with its tx history
    /** Reconciliation against the trusted NetSuite report feed. null if the
     *  feed was unavailable (then rows are engine-only — legacy behavior). */
    feed: ReconcileSummary | null;
  };
}

const ITEM_TYPES = `('InvtPart','Assembly')`;

export async function computeCatalogWorklist(): Promise<WorklistComputation> {
  const ns = createNetSuiteAPI();

  const metaRows = await ns.suiteQLPaged<any>(
    `SELECT id, itemid, displayname FROM item WHERE itemtype IN ${ITEM_TYPES} AND itemid IS NOT NULL`,
  );
  const metaById = new Map<string, ItemMeta>();
  for (const m of metaRows) {
    metaById.set(String(m.id), {
      itemCode: String(m.itemid),
      itemName: m.displayname ?? m.itemid ?? null,
      nsItemId: String(m.id),
    });
  }

  // Inventory-affecting lines for in-scope items, now incl. subsidiary.
  const lineRows = await ns.suiteQLPaged<any>(
    `SELECT t.id AS tx_id, t.tranid AS doc, t.trandate, t.type AS ns_type,
            BUILTIN.DF(t.type) AS ns_type_name, t.memo AS tx_memo,
            BUILTIN.DF(t.subsidiary) AS subsidiary_name,
            tl.id AS line_id, tl.item AS item_id, tl.location, BUILTIN.DF(tl.location) AS loc_name,
            tl.quantity, tl.memo AS line_memo
       FROM transactionline tl
       JOIN transaction t ON t.id = tl.transaction
       JOIN item i ON i.id = tl.item
      WHERE tl.isinventoryaffecting = 'T'
        AND i.itemtype IN ${ITEM_TYPES}
      ORDER BY tl.item, t.trandate, t.id, tl.id`,
  );

  const qohRows = await ns.suiteQLPaged<any>(
    `SELECT il.item AS item_id, il.location AS loc, BUILTIN.DF(il.location) AS loc_name,
            SUM(il.quantityonhand) AS qoh
       FROM inventorybalance il
       JOIN item i ON i.id = il.item
      WHERE i.itemtype IN ${ITEM_TYPES}
      GROUP BY il.item, il.location, BUILTIN.DF(il.location)`,
  );

  // TOrdCost IF→IR links (intercompany 2-doc chains). previousdoc=IF, nextdoc=IR.
  const linkRows = await ns.suiteQLPaged<any>(
    `SELECT previousdoc AS if_tx, nextdoc AS ir_tx FROM nexttransactionlink WHERE linktype='TOrdCost'`,
  );
  const pairs: TOrdCostPair[] = linkRows.map((r: any) => ({ ifTxId: String(r.if_tx), irTxId: String(r.ir_tx) }));

  // Assembly Build component lines: negative inventory-affecting lines on Build
  // docs, keyed by build transaction id. Used for prerequisite component checks.
  const buildCompRows = await ns.suiteQLPaged<any>(
    `SELECT t.id AS tx_id, tl.item AS comp_item_id, i.itemid AS comp_code,
            tl.location AS loc, BUILTIN.DF(tl.location) AS loc_name, tl.quantity
       FROM transactionline tl
       JOIN transaction t ON t.id = tl.transaction
       JOIN item i ON i.id = tl.item
      WHERE t.type='Build' AND tl.isinventoryaffecting='T' AND tl.quantity < 0`,
  );

  // Group lines + qoh by item.
  const linesByItem = new Map<string, RawTxnLine[]>();
  for (const r of lineRows) {
    const k = String(r.item_id);
    (linesByItem.get(k) ?? linesByItem.set(k, []).get(k)!).push(r);
  }
  const qohByItem = new Map<string, RawQoh[]>();
  for (const r of qohRows) {
    const k = String(r.item_id);
    (qohByItem.get(k) ?? qohByItem.set(k, []).get(k)!).push(r);
  }

  const componentsByBuildTxId = new Map<string, BuildComponent[]>();
  for (const r of buildCompRows) {
    const k = String(r.tx_id);
    const arr = componentsByBuildTxId.get(k) ?? componentsByBuildTxId.set(k, []).get(k)!;
    arr.push({
      itemId: String(r.comp_item_id),
      itemCode: String(r.comp_code),
      qty: Math.abs(Number(r.quantity) || 0),
      locationNsId: r.loc == null ? '(no location)' : String(r.loc),
      locationName: r.loc_name ?? String(r.loc),
    });
  }

  // Opening anchor. PREFER the dated trusted-report snapshots (multi-date,
  // re-anchored + validated each segment). Fall back to the legacy single-cutoff
  // anchor (RESTlet/CSV) only if no dated snapshots have been captured.
  const datedByItem = await readAllDatedSnapshots();
  const hasDated = datedByItem.size > 0;
  const { lookup: snapLookup, cutoffDate } = hasDated
    ? { lookup: new Map<string, number>(), cutoffDate: null }
    : await resolveOpeningAnchor();

  const anchorFromLegacy = (itemCode: string): OpeningAnchor | undefined => {
    if (!cutoffDate || snapLookup.size === 0) return undefined;
    const prefix = `${itemCode.toUpperCase()}|`;
    const openingByLocName = new Map<string, number>();
    for (const [k, v] of snapLookup) {
      if (k.startsWith(prefix)) openingByLocName.set(k.slice(prefix.length), v);
    }
    return { cutoffDate, openingByLocName };
  };
  const anchorFor = (itemCode: string): OpeningAnchor | undefined => {
    const dated = datedByItem.get(itemCode.toUpperCase());
    return dated ? buildDatedAnchor(dated) : anchorFromLegacy(itemCode);
  };

  // First pass: assemble + link chains + build ledgers → CatalogContext.
  const ctx: CatalogContext = { byItemId: new Map<string, ItemContext>(), componentsByBuildTxId };
  const residuals: WorklistComputation['residuals'] = [];
  const snapshotsAppliedByItemId = new Map<string, boolean>();
  for (const [itemId, lines] of linesByItem) {
    const meta = metaById.get(itemId) ?? { itemCode: itemId, itemName: null, nsItemId: itemId };
    const anchor = anchorFor(meta.itemCode);
    snapshotsAppliedByItemId.set(itemId, hasDated && datedByItem.has(meta.itemCode.toUpperCase()));
    const assembled = assembleItem(lines, qohByItem.get(itemId) ?? [], anchor);
    for (const r of assembled.residuals) {
      residuals.push({ ...r, itemCode: meta.itemCode, nsItemId: meta.nsItemId, itemName: meta.itemName });
    }
    const txns = linkChains(assembled.transactions, pairs);
    const ledger = computeLedger(txns, assembled.openings, assembled.corrections);
    ctx.byItemId.set(itemId, {
      meta,
      txns,
      openings: assembled.openings,
      ledger,
      chains: buildItemChains(txns),
    });
  }
  // Worst (largest magnitude) residuals first.
  residuals.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual));
  const residualItemCount = new Set(residuals.map((r) => r.itemCode)).size;

  // Second pass: recommendations + windows (now ctx is complete for cross-item checks).
  const rows: WorklistRow[] = [];
  const windows: NegativeWindow[] = [];
  let itemsWithLines = 0;
  for (const [itemId, ic] of ctx.byItemId) {
    itemsWithLines++;
    const itemWindows = computeItemWindows(ic.meta, ic.ledger, {
      snapshotsApplied: snapshotsAppliedByItemId.get(itemId) ?? false,
    });
    windows.push(...itemWindows);
    rows.push(...computeWorklistForItem(ic.meta, ic.txns, ic.openings, ic.ledger, itemWindows, ctx));
  }

  // ── Reconcile against the TRUSTED NetSuite report feed ────────────────────
  // The feed is authoritative for what's negative NOW; the engine supplies the
  // fix plan. Confirmed negatives take the feed's depth; engine "ongoing"
  // negatives the feed says are fine now are dropped; feed-only negatives are
  // surfaced as MANUAL so none is ever lost. Feed failure → engine-only.
  let feedSummary: ReconcileSummary | null = null;
  let finalRows = rows;
  try {
    const feed = await fetchStockMatrix();

    // Which (itemCode, locationNsId) pairs are still OPEN per the engine.
    const ongoingKeys = new Set<string>();
    for (const w of windows) {
      if (w.end === null) ongoingKeys.add(`${w.itemCode.toUpperCase()}|${w.locationNsId}`);
    }

    // itemCode → meta, and tolerant location NAME → ns id (built from the data
    // NetSuite already gave us), for constructing surfaced feed-only rows.
    const metaByCode = new Map<string, ItemMeta>();
    for (const m of metaById.values()) metaByCode.set(m.itemCode.toUpperCase(), m);
    const locIdByName = new Map<string, string>();
    for (const r of [...lineRows, ...qohRows]) {
      const name = r.loc_name ?? r.location ?? r.loc;
      const id = r.location ?? r.loc;
      if (name != null && id != null) locIdByName.set(normalizeLocationName(String(name)), String(id));
    }

    const result = reconcileWorklistWithFeed({
      rows,
      feed,
      isOngoing: (row) => ongoingKeys.has(`${row.itemCode.toUpperCase()}|${row.locationNsId}`),
      buildFeedOnlyRow: (neg: StockRow): WorklistRow => {
        const meta = metaByCode.get(neg.itemCode.trim().toUpperCase());
        const locId = locIdByName.get(normalizeLocationName(neg.location)) ?? neg.location;
        return {
          itemCode: neg.itemCode,
          nsItemId: meta?.nsItemId ?? null,
          itemName: meta?.itemName ?? neg.displayName ?? null,
          locationNsId: locId,
          locationName: neg.location,
          depth: neg.qoh,
          since: null,
          tier: 3,
          feedStatus: 'surfaced',
          recommendationType: 'Manual review',
          category: 'MANUAL',
          editsRequired: [],
          prerequisiteSummary: 'None',
          isBrokenChain: false,
          notes:
            'Surfaced from the trusted NetSuite report; the engine had no ongoing case here ' +
            '(its reconstruction shows this location as non-negative). Investigate in NetSuite.',
          options: [],
          suspectNsTransactionId: null,
          suspectDoc: null,
          suspectType: null,
          suspectDate: null,
        };
      },
    });
    finalRows = result.rows;
    feedSummary = result.summary;
  } catch (err) {
    // Feed unavailable (URL not set, hash expired, format drift) — fall back to
    // engine-only rows so the worklist never goes dark. Surfaced via feed=null.
    console.warn(`[worklist] feed reconciliation skipped: ${(err as Error).message}`);
  }

  finalRows.sort((a, b) => a.depth - b.depth);

  return {
    rows: finalRows,
    windows,
    residuals,
    stats: {
      itemsScanned: metaById.size,
      itemsWithLines,
      cases: finalRows.length,
      cleanCount: finalRows.filter((r) => r.category === 'CLEAN').length,
      windowCount: windows.length,
      chainPairs: pairs.length,
      residualItems: residualItemCount,
      feed: feedSummary,
    },
  };
}
