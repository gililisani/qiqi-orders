/**
 * Compute the catalog-wide worklist. SERVER-ONLY.
 *
 * Pulls the ENTIRE inventory-affecting ledger for all Inventory Items +
 * Assemblies in as few SuiteQL round-trips as possible (one paginated lines
 * query, one QOH query, one item-metadata query), groups by item in memory,
 * and runs the recommendation engine per item. The dominant cost is NetSuite
 * pagination latency, not the math.
 */
import { createNetSuiteAPI } from '@/lib/netsuite';
import { computeLedger } from '@/lib/inventory/balanceEngine';
import { assembleItem, type RawTxnLine, type RawQoh } from '@/lib/inventory/assemble';
import { computeWorklistForItem, type WorklistRow, type ItemMeta } from '@/lib/inventory/worklist';
import { computeItemWindows, type NegativeWindow } from '@/lib/inventory/negativeWindows';

export interface WorklistComputation {
  rows: WorklistRow[];
  windows: NegativeWindow[];
  stats: {
    itemsScanned: number;
    itemsWithLines: number;
    cases: number;
    cleanCount: number;
    windowCount: number;
  };
}

// Item types in scope: Inventory Item (InvtPart) + Assembly.
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

  const lineRows = await ns.suiteQLPaged<any>(
    `SELECT t.id AS tx_id, t.tranid AS doc, t.trandate, t.type AS ns_type,
            BUILTIN.DF(t.type) AS ns_type_name, t.memo AS tx_memo,
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

  // Group by item id.
  const linesByItem = new Map<string, RawTxnLine[]>();
  for (const r of lineRows) {
    const k = String(r.item_id);
    const a = linesByItem.get(k);
    if (a) a.push(r);
    else linesByItem.set(k, [r]);
  }
  const qohByItem = new Map<string, RawQoh[]>();
  for (const r of qohRows) {
    const k = String(r.item_id);
    const a = qohByItem.get(k);
    if (a) a.push(r);
    else qohByItem.set(k, [r]);
  }

  const rows: WorklistRow[] = [];
  const windows: NegativeWindow[] = [];
  let itemsWithLines = 0;
  for (const [itemId, lines] of linesByItem) {
    itemsWithLines++;
    const meta = metaById.get(itemId) ?? { itemCode: itemId, itemName: null, nsItemId: itemId };
    const { transactions, openings } = assembleItem(lines, qohByItem.get(itemId) ?? []);
    const ledger = computeLedger(transactions, openings);
    const itemWindows = computeItemWindows(meta, ledger);
    windows.push(...itemWindows);
    rows.push(...computeWorklistForItem(meta, transactions, openings, ledger, itemWindows));
  }

  // Worst negatives first (depth is negative → ascending = most negative first).
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
    },
  };
}
