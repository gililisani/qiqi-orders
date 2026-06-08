/**
 * Pull a single item's full inventory-affecting transaction history from NetSuite.
 *
 * SERVER-ONLY — uses createNetSuiteAPI() (OAuth secrets). Never import into a
 * 'use client' file.
 *
 * Validated rules (anchors: COM0067 Ambix=2616 / Main=-22946 / Bio-Direct
 * carries 932 into 2024; BAS0009 = 0 suspects), all applied in assembleItem():
 *   - inventory-moving lines = transactionline.isinventoryaffecting = 'T'
 *     (NOT a transaction-type whitelist; also excludes financial-only VendBill /
 *      COGS / GL lines)
 *   - signed inventory impact = transactionline.quantity AS-IS
 *   - transfers = two opposite-signed legs sharing transaction.id
 *   - DD/MM dates → normalizeNsDate()
 *   - opening(item,loc) = currentQOH - SUM(signed)
 */
import { createNetSuiteAPI } from '@/lib/netsuite';
import { assembleItem } from '@/lib/inventory/assemble';
import type { LedgerTxn, OpeningBalance } from '@/lib/inventory/balanceEngine';

export interface PulledItem {
  itemCode: string;
  nsItemId: string;
  itemName: string;
  itemType: string;
  transactions: LedgerTxn[];
  openings: OpeningBalance[];
  residuals: import('@/lib/inventory/assemble').LocationResidual[];
  dateMin: string | null;
  dateMax: string | null;
}

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

  const qohRows = await ns.suiteQLPaged<any>(
    `SELECT il.location AS loc, BUILTIN.DF(il.location) AS loc_name,
            SUM(il.quantityonhand) AS qoh
       FROM inventorybalance il
      WHERE il.item = ${nsItemId}
      GROUP BY il.location, BUILTIN.DF(il.location)`,
  );

  const { transactions, openings, residuals, dateMin, dateMax } = assembleItem(lines, qohRows);
  return { itemCode: itemCode.toUpperCase(), nsItemId, itemName, itemType, transactions, openings, residuals, dateMin, dateMax };
}
