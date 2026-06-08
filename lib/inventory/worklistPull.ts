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
import { assembleItem, type RawTxnLine, type RawQoh } from '@/lib/inventory/assemble';
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

export interface WorklistComputation {
  rows: WorklistRow[];
  windows: NegativeWindow[];
  stats: {
    itemsScanned: number;
    itemsWithLines: number;
    cases: number;
    cleanCount: number;
    windowCount: number;
    chainPairs: number;
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

  // First pass: assemble + link chains + build ledgers → CatalogContext.
  const ctx: CatalogContext = { byItemId: new Map<string, ItemContext>(), componentsByBuildTxId };
  for (const [itemId, lines] of linesByItem) {
    const meta = metaById.get(itemId) ?? { itemCode: itemId, itemName: null, nsItemId: itemId };
    const assembled = assembleItem(lines, qohByItem.get(itemId) ?? []);
    const txns = linkChains(assembled.transactions, pairs);
    const ledger = computeLedger(txns, assembled.openings);
    ctx.byItemId.set(itemId, {
      meta,
      txns,
      openings: assembled.openings,
      ledger,
      chains: buildItemChains(txns),
    });
  }

  // Second pass: recommendations + windows (now ctx is complete for cross-item checks).
  const rows: WorklistRow[] = [];
  const windows: NegativeWindow[] = [];
  let itemsWithLines = 0;
  for (const [, ic] of ctx.byItemId) {
    itemsWithLines++;
    const itemWindows = computeItemWindows(ic.meta, ic.ledger);
    windows.push(...itemWindows);
    rows.push(...computeWorklistForItem(ic.meta, ic.txns, ic.openings, ic.ledger, itemWindows, ctx));
  }

  rows.sort((a, b) => a.depth - b.depth);

  return {
    rows,
    windows,
    stats: {
      itemsScanned: metaById.size,
      itemsWithLines,
      cases: rows.length,
      cleanCount: rows.filter((r) => r.category === 'CLEAN').length,
      windowCount: windows.length,
      chainPairs: pairs.length,
    },
  };
}
