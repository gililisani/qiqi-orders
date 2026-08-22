import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { shopifyGraphQL } from '../../../lib/shopify/client';
import { createNetSuiteForTarget } from '../../../lib/shopify/engine/nsTarget';
async function rest(ns: any, method: string, p: string, data?: any) {
  const url = `${ns.baseUrl}${p}`;
  const res = await axios({ method, url, headers: { Authorization: ns.getAuthHeader(url, method), Accept: 'application/json', 'Content-Type': 'application/json' }, data: data ? JSON.stringify(data) : undefined, validateStatus: () => true });
  if (res.status >= 400) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(res.data).slice(0, 220)}`);
  return res.data;
}
async function paymentFor(ns: any, invoiceId: string) {
  const scriptId = process.env.NETSUITE_INVPDF_SCRIPT_ID!, deployId = process.env.NETSUITE_INVPDF_DEPLOY_ID!;
  const acct = process.env.NETSUITE_ACCOUNT_ID!.toLowerCase().replace(/_/g, '-');
  const url = `https://${acct}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?${new URLSearchParams({ script: scriptId, deploy: deployId, paymentForInvoice: invoiceId, debug: '1' })}`;
  const res = await axios({ method: 'GET', url, headers: { Authorization: ns.getAuthHeader(url, 'GET'), Accept: 'application/json', 'Content-Type': 'application/json' }, validateStatus: () => true });
  return [...new Set((res.data?.applying ?? []).filter((a: any) => /^payment/i.test(a.tranid)).map((a: any) => String(a.id)))];
}
async function main() {
  const ns: any = createNetSuiteForTarget('production');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const d = await shopifyGraphQL(`{ orders(first: 1, query: "name:#6760") { nodes { id currentTotalTaxSet { shopMoney { amount } } lineItems(first: 20) { nodes { sku quantity originalTotalSet { shopMoney { amount } } discountAllocations { allocatedAmountSet { shopMoney { amount } } } } } transactions(first: 10) { kind status amountSet { shopMoney { amount } } } } } }`);
  const o = d.orders.nodes[0]; const sid = o.id.replace(/^.*\//, '');
  const charged = o.transactions.filter((t: any) => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS').reduce((s: number, t: any) => s + Number(t.amountSet.shopMoney.amount), 0);
  const tax = Number(o.currentTotalTaxSet.shopMoney.amount);
  const wholesale = new Map(o.lineItems.nodes.map((l: any) => [l.sku, { total: Math.round((Number(l.originalTotalSet.shopMoney.amount) - l.discountAllocations.reduce((a: number, x: any) => a + Number(x.allocatedAmountSet.shopMoney.amount), 0)) * 100) / 100, qty: l.quantity }]));
  const { data: st } = await db.from('netscore_transaction_stamps').select('ns_transaction_id, tran_type, tran_id').eq('shopify_order_id', sid).eq('ns_target', 'production');
  const inv = st!.find((s) => s.tran_type === 'CustInvc')!, so = st!.find((s) => s.tran_type === 'SalesOrd')!;
  const fix = async (type: string, id: string) => {
    const items = (await rest(ns, 'GET', `/record/v1/${type}/${id}/item?expandSubResources=true`)).items ?? [];
    const patch: any[] = [];
    for (const it of items) {
      const sku = String(it.item?.refName ?? '').split(' ')[0];
      const w = wholesale.get(sku);
      if (w) { const rate = Math.round((w.total / w.qty) * 100) / 100; patch.push({ line: it.line, item: { id: it.item.id }, price: { id: '-1' }, rate, amount: w.total }); continue; }
      if (/Shopify Tax Item/i.test(it.item?.refName ?? '')) patch.push({ line: it.line, item: { id: '1464' }, quantity: 1, price: { id: '-1' }, rate: tax, amount: tax, description: 'TAX (BE VAT, DDP pass-through)' });
    }
    if (patch.length) await rest(ns, 'PATCH', `/record/v1/${type}/${id}`, { item: { items: patch } });
    const h = await rest(ns, 'GET', `/record/v1/${type}/${id}?fields=total`);
    return { n: patch.length, total: h.total };
  };
  const ri = await fix('invoice', inv.ns_transaction_id);
  console.log(`invoice ${inv.tran_id}: ${ri.n} lines set → $${ri.total} (Shopify $${charged.toFixed(2)})`);
  try { const rs = await fix('salesOrder', so.ns_transaction_id); console.log(`SO ${so.tran_id}: ${rs.n} lines set → $${rs.total}`); } catch (e: any) { console.log(`SO: ${String(e?.message).slice(0, 160)}`); }
  if (Math.abs(Number(ri.total) - charged) > 0.005) { console.log('✗ total mismatch — payment untouched'); return; }
  const pays = await paymentFor(ns, inv.ns_transaction_id);
  if (pays.length !== 1) { console.log(`✗ ${pays.length} payments — untouched`); return; }
  await ns.updateRecord('customerpayment', pays[0], { payment: charged, apply: { items: [{ doc: Number(inv.ns_transaction_id), apply: true, amount: charged }] } });
  const gl = await ns.suiteQL(`SELECT a.acctnumber, SUM(NVL(tal.debit,0)) AS d, SUM(NVL(tal.credit,0)) AS c FROM transactionaccountingline tal JOIN account a ON a.id = tal.account WHERE tal.transaction = ${inv.ns_transaction_id} GROUP BY a.acctnumber ORDER BY a.acctnumber`);
  const pay = await ns.suiteQL(`SELECT tranid, foreigntotal FROM transaction WHERE id = ${pays[0]}`);
  console.log(`✓ payment ${pay[0].tranid} → $${pay[0].foreigntotal} · invoice GL: ${gl.map((g: any) => `${g.acctnumber} ${Number(g.d) ? 'Dr ' + g.d : 'Cr ' + g.c}`).join(' | ')}`);
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
