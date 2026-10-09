/**
 * Sales ledger — NetSuite adapter. READ-ONLY: SuiteQL queries only.
 *
 * Batched across customers (headers, then lines / sales-order links in
 * chunks) so a full sync is ~20 queries, not hundreds. Account quirks (see
 * memory/netsuite quirks): dates come back DD/MM/YYYY → normalizeNsDate;
 * date filters need TO_DATE; `type` codes, not recordtype; assembly
 * component sub-lines have NULL amounts and are skipped; invoice → sales
 * order lives in nexttransactionlink (linktype 'OrdBill', previousdoc = SO).
 * Credits are traced to the invoice they credit (traceCreditedInvoices).
 */

import type { NetSuiteAPI } from '../netsuite';
import { normalizeNsDate } from '../netsuite';
import type { CreditLink, ErpDocType, ErpDocument, ErpLine } from './classify';

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

  const creditIds = live
    .filter((h) => TYPE_MAP[String(h.type)] === 'credit_memo' || TYPE_MAP[String(h.type)] === 'cash_refund')
    .map((h) => Number(h.id))
    .filter(Number.isFinite);
  const credited = await traceCreditedInvoices(ns, creditIds);

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
      creditedInvoices: credited.get(id)?.invoices,
      creditLink: credited.get(id)?.via ?? null,
    };
    const key = String(h.entity);
    if (!byCustomer.has(key)) byCustomer.set(key, []);
    byCustomer.get(key)!.push(doc);
  }
  return byCustomer;
}

const LINK_STRENGTH: Record<CreditLink, number> = { created_from: 3, return_authorization: 2, return_authorization_order: 1 };

/**
 * The invoice(s) each credit memo / refund credits, from NetSuite's own links
 * (none of this shows on NetSuite's screens):
 *  - line-level createdfrom → an invoice ("created from"), or
 *  - → a Return Authorization (this account's integration role can't read
 *    RtnAuth records, but the link INTO them is readable: linktype 'SaleRet'
 *    from the invoice or sales order it was made from) → that invoice, or
 *    that sales order's invoices (linktype 'OrdBill').
 * "Applied to" (Payment links) is deliberately ignored — credits are often
 * applied to a later, unrelated invoice. Read-only.
 */
export async function traceCreditedInvoices(
  ns: Pick<NetSuiteAPI, 'suiteQLPaged'>,
  creditIds: number[]
): Promise<Map<string, { via: CreditLink; invoices: Array<{ erpId: string; tranid: string }> }>> {
  const out = new Map<string, { via: CreditLink; invoices: Array<{ erpId: string; tranid: string }> }>();
  if (creditIds.length === 0) return out;

  // 1. What each credit was created from.
  const createdFrom = new Map<string, Set<string>>(); // credit → source ids
  for (const part of chunks(creditIds, CHUNK)) {
    const rows = await ns.suiteQLPaged<Record<string, any>>(
      `SELECT DISTINCT transaction, createdfrom FROM transactionline ` +
        `WHERE transaction IN (${part.join(',')}) AND createdfrom IS NOT NULL`
    );
    for (const r of rows) {
      const key = String(r.transaction);
      if (!createdFrom.has(key)) createdFrom.set(key, new Set());
      createdFrom.get(key)!.add(String(r.createdfrom));
    }
  }

  const docs = new Map<string, { tranid: string; type: string }>();
  const resolve = async (ids: string[]) => {
    const missing = ids.filter((i) => !docs.has(i));
    for (const part of chunks(missing, 500)) {
      const rows = await ns.suiteQLPaged<Record<string, any>>(
        `SELECT id, tranid, type FROM transaction WHERE id IN (${part.join(',')})`
      );
      for (const r of rows) docs.set(String(r.id), { tranid: String(r.tranid ?? r.id), type: String(r.type ?? '') });
    }
  };
  await resolve([...new Set([...createdFrom.values()].flatMap((v) => [...v]))]);

  // 2. Return Authorizations (unreadable here, or typed RtnAuth) → what they came from.
  const raIds = [...new Set([...createdFrom.values()].flatMap((v) => [...v]))].filter((i) => {
    const t = docs.get(i)?.type;
    return !t || t === 'RtnAuth';
  });
  const raSource = new Map<string, string>();
  for (const part of chunks(raIds, CHUNK)) {
    const rows = await ns.suiteQLPaged<Record<string, any>>(
      `SELECT previousdoc, nextdoc FROM nexttransactionlink WHERE nextdoc IN (${part.join(',')}) AND linktype = 'SaleRet'`
    );
    for (const r of rows) if (!raSource.has(String(r.nextdoc))) raSource.set(String(r.nextdoc), String(r.previousdoc));
  }
  await resolve([...new Set(raSource.values())]);

  // 3. Sales orders behind those → their invoices.
  const soIds = [...new Set(raSource.values())].filter((i) => docs.get(i)?.type === 'SalesOrd');
  const soInvoices = new Map<string, string[]>();
  for (const part of chunks(soIds, CHUNK)) {
    const rows = await ns.suiteQLPaged<Record<string, any>>(
      `SELECT previousdoc, nextdoc FROM nexttransactionlink WHERE previousdoc IN (${part.join(',')}) AND linktype = 'OrdBill'`
    );
    for (const r of rows) {
      const key = String(r.previousdoc);
      if (!soInvoices.has(key)) soInvoices.set(key, []);
      soInvoices.get(key)!.push(String(r.nextdoc));
    }
  }
  await resolve([...new Set([...soInvoices.values()].flat())]);

  for (const [credit, sources] of createdFrom) {
    let via: CreditLink | null = null;
    const invoices = new Map<string, string>();
    const take = (link: CreditLink, ids: string[]) => {
      for (const i of ids) if (docs.get(i)?.type === 'CustInvc') invoices.set(i, docs.get(i)!.tranid);
      if (ids.some((i) => docs.get(i)?.type === 'CustInvc') && (!via || LINK_STRENGTH[link] > LINK_STRENGTH[via])) via = link;
    };
    for (const src of sources) {
      const type = docs.get(src)?.type;
      if (type === 'CustInvc') take('created_from', [src]);
      else if (!type || type === 'RtnAuth') {
        const origin = raSource.get(src);
        if (!origin) continue;
        const originType = docs.get(origin)?.type;
        if (originType === 'CustInvc') take('return_authorization', [origin]);
        else if (originType === 'SalesOrd') take('return_authorization_order', soInvoices.get(origin) ?? []);
      }
    }
    if (via && invoices.size) {
      out.set(credit, { via, invoices: [...invoices].map(([erpId, tranid]) => ({ erpId, tranid })) });
    }
  }
  return out;
}
