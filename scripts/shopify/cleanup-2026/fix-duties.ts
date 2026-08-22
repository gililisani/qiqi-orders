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
  if (res.status >= 400) throw new Error(`${method} ${p} → ${res.status} ${JSON.stringify(res.data).slice(0, 200)}`);
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
  for (const name of ['6991', '7251', '7268']) {
    try {
      const d = await shopifyGraphQL(`{ orders(first: 1, query: "name:#${name}") { nodes { id currentTotalDutiesSet { shopMoney { amount } } currentTotalDiscountsSet { shopMoney { amount } } transactions(first: 10) { kind status amountSet { shopMoney { amount } } } } } }`);
      const o = d.orders.nodes[0]; const sid = o.id.replace(/^.*\//, '');
      const duties = Number(o.currentTotalDutiesSet?.shopMoney?.amount ?? 0);
      const discount = Number(o.currentTotalDiscountsSet.shopMoney.amount);
      const charged = o.transactions.filter((t: any) => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS').reduce((s: number, t: any) => s + Number(t.amountSet.shopMoney.amount), 0);
      const { data: st } = await db.from('netscore_transaction_stamps').select('ns_transaction_id, tran_type, tran_id').eq('shopify_order_id', sid).eq('ns_target', 'production');
      const inv = st!.find((s) => s.tran_type === 'CustInvc')!;
      const before = await rest(ns, 'GET', `/record/v1/invoice/${inv.ns_transaction_id}?fields=total,discountRate`);
      // append the duties line on the DDP pass-through item (invoice-only, → 240504)
      await rest(ns, 'PATCH', `/record/v1/invoice/${inv.ns_transaction_id}`, {
        item: { items: [{ item: { id: '1464' }, quantity: 1, price: { id: '-1' }, rate: duties, amount: duties, description: 'Import Duties' }] },
        // NS turns a flat header discount into a % on edit and re-applies it to the new line — re-assert the flat amount (QA #7268 finding)
        ...(discount > 0 ? { discountItem: { id: '1056' }, discountRate: -discount } : {}),
      });
      let after = await rest(ns, 'GET', `/record/v1/invoice/${inv.ns_transaction_id}?fields=total,discountRate`);
      if (Math.abs(Number(after.total) - charged) > 0.005 && discount > 0) {
        await rest(ns, 'PATCH', `/record/v1/invoice/${inv.ns_transaction_id}`, { discountItem: { id: '1056' }, discountRate: -discount });
        after = await rest(ns, 'GET', `/record/v1/invoice/${inv.ns_transaction_id}?fields=total,discountRate`);
      }
      if (Math.abs(Number(after.total) - charged) > 0.005) { console.log(`✗ #${name}: invoice $${before.total} → $${after.total} ≠ charged $${charged.toFixed(2)} — payment untouched`); continue; }
      const pays = await paymentFor(ns, inv.ns_transaction_id);
      if (pays.length !== 1) { console.log(`✗ #${name}: ${pays.length} payments — untouched`); continue; }
      await ns.updateRecord('customerpayment', pays[0], { payment: charged, apply: { items: [{ doc: Number(inv.ns_transaction_id), apply: true, amount: charged }] } });
      const gl = await ns.suiteQL(`SELECT a.acctnumber, SUM(NVL(tal.credit,0)) AS c FROM transactionaccountingline tal JOIN account a ON a.id = tal.account WHERE tal.transaction = ${inv.ns_transaction_id} AND a.acctnumber = '240504' GROUP BY a.acctnumber`);
      console.log(`✓ #${name}: invoice $${before.total} → $${after.total} (+$${duties.toFixed(2)} duties → 240504 now $${gl[0]?.c ?? 0}) · payment → $${charged.toFixed(2)}`);
    } catch (e: any) { console.log(`✗ #${name}: ${String(e?.message).slice(0, 300)}`); }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
