/**
 * Sales ledger — NetSuite adapter. READ-ONLY: SuiteQL queries only.
 *
 * Batched across customers (headers, then lines / sales-order links in
 * chunks) so a full sync is ~20 queries, not hundreds. Account quirks (see
 * memory/netsuite quirks): dates come back DD/MM/YYYY → normalizeNsDate;
 * date filters need TO_DATE; `type` codes, not recordtype; assembly
 * component sub-lines have NULL amounts and are skipped; invoice → sales
 * order lives in nexttransactionlink (linktype 'OrdBill', previousdoc = SO).
 */

import type { NetSuiteAPI } from '../netsuite';
import { normalizeNsDate } from '../netsuite';
import type { ErpDocType, ErpDocument, ErpLine } from './classify';

const TYPE_MAP: Record<string, ErpDocType> = {
  CustInvc: 'invoice',
  CustCred: 'credit_memo',
  CashSale: 'cash_sale',
  CashRfnd: 'cash_refund',
};
const CHUNK = 150;

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Every billing document of the given customers dated on/after `since`
 * (YYYY-MM-DD), grouped by customer internal id. Voided documents are left
 * out (they never happened).
 */
export async function fetchErpDocuments(
  ns: Pick<NetSuiteAPI, 'suiteQLPaged'>,
  customerIds: number[],
  since: string
): Promise<Map<string, ErpDocument[]>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error(`Invalid history start date: ${since}`);
  const ids = customerIds.filter((n) => Number.isInteger(n) && n > 0);
  const byCustomer = new Map<string, ErpDocument[]>();
  if (ids.length === 0) return byCustomer;

  const headers: Record<string, any>[] = [];
  for (const part of chunks(ids, 200)) {
    headers.push(
      ...(await ns.suiteQLPaged<Record<string, any>>(
        `SELECT t.id, t.type, t.tranid, t.trandate, t.foreigntotal, t.exchangerate, ` +
          `BUILTIN.DF(t.currency) AS currency, t.status, t.entity, t.memo, t.otherrefnum ` +
          `FROM transaction t WHERE t.entity IN (${part.join(',')}) ` +
          `AND t.type IN ('CustInvc','CustCred','CashSale','CashRfnd') ` +
          `AND t.trandate >= TO_DATE('${since}','YYYY-MM-DD')`
      ))
    );
  }
  const live = headers.filter((h) => TYPE_MAP[String(h.type)] && String(h.status ?? '') !== 'V');
  const docIds = live.map((h) => Number(h.id)).filter(Number.isFinite);

  const linesByDoc = new Map<string, ErpLine[]>();
  const soByDoc = new Map<string, string>();
  for (const part of chunks(docIds, CHUNK)) {
    const lines = await ns.suiteQLPaged<Record<string, any>>(
      `SELECT tl.transaction, tl.id AS lineid, tl.taxline, tl.itemtype AS linetype, ` +
        `i.itemid, i.displayname, i.itemtype, tl.quantity, tl.foreignamount ` +
        `FROM transactionline tl LEFT JOIN item i ON i.id = tl.item ` +
        `WHERE tl.transaction IN (${part.join(',')}) AND tl.mainline = 'F' AND tl.foreignamount IS NOT NULL`
    );
    for (const l of lines) {
      const key = String(l.transaction);
      if (!linesByDoc.has(key)) linesByDoc.set(key, []);
      linesByDoc.get(key)!.push({
        lineNo: num(l.lineid),
        sku: l.itemid ? String(l.itemid) : null,
        itemName: l.displayname ? String(l.displayname) : l.itemid ? String(l.itemid) : null,
        itemType: l.itemtype ? String(l.itemtype) : l.linetype ? String(l.linetype) : null,
        isTax: String(l.taxline) === 'T',
        quantity: l.quantity === null || l.quantity === undefined ? null : num(l.quantity),
        foreignAmount: num(l.foreignamount),
      });
    }
    const links = await ns.suiteQLPaged<Record<string, any>>(
      `SELECT previousdoc, nextdoc FROM nexttransactionlink ` +
        `WHERE nextdoc IN (${part.join(',')}) AND linktype = 'OrdBill'`
    );
    for (const k of links) if (!soByDoc.has(String(k.nextdoc))) soByDoc.set(String(k.nextdoc), String(k.previousdoc));
  }

  const soIds = [...new Set(soByDoc.values())].map(Number).filter(Number.isFinite);
  const soTranid = new Map<string, string>();
  for (const part of chunks(soIds, 500)) {
    const rows = await ns.suiteQLPaged<Record<string, any>>(
      `SELECT id, tranid FROM transaction WHERE id IN (${part.join(',')})`
    );
    for (const r of rows) soTranid.set(String(r.id), String(r.tranid));
  }

  for (const h of live) {
    const id = String(h.id);
    const date = normalizeNsDate(h.trandate);
    if (!date) continue;
    const so = soByDoc.get(id) ?? null;
    const doc: ErpDocument = {
      erpId: id,
      type: TYPE_MAP[String(h.type)],
      tranid: String(h.tranid ?? id),
      date,
      currency: String(h.currency || 'USD'),
      exchangeRate: num(h.exchangerate) || 1,
      foreignTotal: num(h.foreigntotal),
      status: h.status ? String(h.status) : null,
      memo: h.memo ? String(h.memo) : null,
      poRef: h.otherrefnum ? String(h.otherrefnum) : null,
      soErpId: so,
      soTranid: so ? soTranid.get(so) ?? null : null,
      lines: (linesByDoc.get(id) ?? []).sort((a, b) => a.lineNo - b.lineNo),
    };
    const key = String(h.entity);
    if (!byCustomer.has(key)) byCustomer.set(key, []);
    byCustomer.get(key)!.push(doc);
  }
  return byCustomer;
}
