import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { shopifyGraphQL } from '../../../lib/shopify/client';
import { createNetSuiteForTarget } from '../../../lib/shopify/engine/nsTarget';

async function rest(ns: any, method: string, pathPart: string, data?: any) {
  const url = `${ns.baseUrl}${pathPart}`;
  const res = await axios({ method, url, headers: { Authorization: ns.getAuthHeader(url, method), Accept: 'application/json', 'Content-Type': 'application/json' }, data: data ? JSON.stringify(data) : undefined, validateStatus: () => true });
  if (res.status >= 400) throw new Error(`${method} ${pathPart} → ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
  return res.data;
}
async function paymentFor(ns: any, invoiceId: string) {
  const scriptId = process.env.NETSUITE_INVPDF_SCRIPT_ID!, deployId = process.env.NETSUITE_INVPDF_DEPLOY_ID!;
  const acct = process.env.NETSUITE_ACCOUNT_ID!.toLowerCase().replace(/_/g, '-');
  const url = `https://${acct}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?${new URLSearchParams({ script: scriptId, deploy: deployId, paymentForInvoice: invoiceId, debug: '1' })}`;
  const res = await axios({ method: 'GET', url, headers: { Authorization: ns.getAuthHeader(url, 'GET'), Accept: 'application/json', 'Content-Type': 'application/json' }, validateStatus: () => true });
  return [...new Set((res.data?.applying ?? []).filter((a: any) => /^payment/i.test(a.tranid)).map((a: any) => String(a.id)))];
}
async function fixRecord(ns: any, type: string, id: string, discount: number) {
  const items = (await rest(ns, 'GET', `/record/v1/${type}/${id}/item?expandSubResources=true`)).items ?? [];
  const extra = items.filter((it: any) => /Shopify Discount/i.test(it.item?.refName ?? ''));
  // REST cannot delete sublist lines (405): neutralize the stray discount
  // line to $0 and carry the real discount on the header, like NetScore did.
  await rest(ns, 'PATCH', `/record/v1/${type}/${id}`, {
    discountItem: { id: '1056' },
    discountRate: -discount,
    ...(extra.length ? { item: { items: extra.map((it: any) => ({ line: it.line, item: { id: '1056' }, rate: 0, amount: 0 })) } } : {}),
  });
  const h = await rest(ns, 'GET', `/record/v1/${type}/${id}?fields=total,discountRate`);
  return { removedLines: extra.length, total: h.total, discountRate: h.discountRate };
}
async function main() {
  const ns: any = createNetSuiteForTarget('production');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  for (const name of ['6739', '6903']) {
    const d = await shopifyGraphQL(`{ orders(first: 1, query: "name:#${name}") { nodes { id currentTotalDiscountsSet { shopMoney { amount } } transactions(first: 10) { kind status amountSet { shopMoney { amount } } } } } }`);
    const o = d.orders.nodes[0]; const sid = o.id.replace(/^.*\//, '');
    const discount = Number(o.currentTotalDiscountsSet.shopMoney.amount);
    const charged = o.transactions.filter((t: any) => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS').reduce((s: number, t: any) => s + Number(t.amountSet.shopMoney.amount), 0);
    const { data: st } = await db.from('netscore_transaction_stamps').select('ns_transaction_id, tran_type, tran_id').eq('shopify_order_id', sid).eq('ns_target', 'production');
    const inv = st!.find((s) => s.tran_type === 'CustInvc')!, so = st!.find((s) => s.tran_type === 'SalesOrd')!;
    try {
      const ri = await fixRecord(ns, 'invoice', inv.ns_transaction_id, discount);
      console.log(`#${name} invoice ${inv.tran_id}: removed ${ri.removedLines} extra discount line(s), header discount ${ri.discountRate} → total $${ri.total} (Shopify $${charged.toFixed(2)})`);
      try { const rs = await fixRecord(ns, 'salesOrder', so.ns_transaction_id, discount); console.log(`#${name} SO ${so.tran_id}: removed ${rs.removedLines}, discount ${rs.discountRate} → total $${rs.total}`); }
      catch (e: any) { console.log(`#${name} SO: ${String(e?.message).slice(0, 160)}`); }
      if (Math.abs(Number(ri.total) - charged) > 0.005) { console.log(`✗ #${name}: invoice $${ri.total} ≠ charged — payment untouched`); continue; }
      const pays = await paymentFor(ns, inv.ns_transaction_id);
      if (pays.length !== 1) { console.log(`✗ #${name}: ${pays.length} payments found — untouched`); continue; }
      await ns.updateRecord('customerpayment', pays[0], { payment: charged, apply: { items: [{ doc: Number(inv.ns_transaction_id), apply: true, amount: charged }] } });
      const chk = await ns.suiteQL(`SELECT tranid, foreigntotal, foreignamountunpaid FROM transaction WHERE id IN (${inv.ns_transaction_id}, ${pays[0]})`);
      console.log(`✓ #${name}: ${chk.map((r: any) => `${r.tranid} $${r.foreigntotal}${r.foreignamountunpaid !== undefined ? ` (unpaid ${r.foreignamountunpaid})` : ''}`).join(' · ')}`);
    } catch (e: any) { console.log(`✗ #${name}: ${String(e?.message).slice(0, 300)}`); }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
