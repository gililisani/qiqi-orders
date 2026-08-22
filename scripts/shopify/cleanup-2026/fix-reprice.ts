import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { shopifyGraphQL } from '../../../lib/shopify/client';
import { createNetSuiteForTarget } from '../../../lib/shopify/engine/nsTarget';

async function paymentFor(ns: any, invoiceId: string) {
  const scriptId = process.env.NETSUITE_INVPDF_SCRIPT_ID!, deployId = process.env.NETSUITE_INVPDF_DEPLOY_ID!;
  const acct = process.env.NETSUITE_ACCOUNT_ID!.toLowerCase().replace(/_/g, '-');
  const url = `https://${acct}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?${new URLSearchParams({ script: scriptId, deploy: deployId, paymentForInvoice: invoiceId, debug: '1' })}`;
  const res = await axios({ method: 'GET', url, headers: { Authorization: ns.getAuthHeader(url, 'GET'), Accept: 'application/json', 'Content-Type': 'application/json' }, validateStatus: () => true });
  const pays = [...new Set((res.data?.applying ?? []).filter((a: any) => /^payment/i.test(a.tranid)).map((a: any) => String(a.id)))];
  return pays;
}

async function main() {
  const ns: any = createNetSuiteForTarget('production');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const items = new Map((await ns.suiteQL(`SELECT id, itemid FROM item WHERE itemid LIKE 'FPS%' OR itemid LIKE 'TOL%'`)).map((r: any) => [String(r.id), r.itemid]));
  for (const name of process.argv.slice(2)) {
    try {
      const d = await shopifyGraphQL(`{ orders(first: 1, query: "name:#${name}") { nodes { id currentTotalDiscountsSet { shopMoney { amount } } currentShippingPriceSet { shopMoney { amount } }
        lineItems(first: 20) { nodes { sku quantity originalUnitPriceSet { shopMoney { amount } } } } transactions(first: 10) { kind status amountSet { shopMoney { amount } } } } } }`);
      const o = d.orders.nodes[0]; const sid = o.id.replace(/^.*\//, '');
      const charged = o.transactions.filter((t: any) => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS').reduce((s: number, t: any) => s + Number(t.amountSet.shopMoney.amount), 0);
      const shopPrice = new Map(o.lineItems.nodes.map((l: any) => [l.sku, Number(l.originalUnitPriceSet.shopMoney.amount)]));
      const shopDiscount = Number(o.currentTotalDiscountsSet.shopMoney.amount);
      const { data: st } = await db.from('netscore_transaction_stamps').select('ns_transaction_id, tran_type, tran_id').eq('shopify_order_id', sid).eq('ns_target', 'production');
      const inv = st!.find((s) => s.tran_type === 'CustInvc')!, so = st!.find((s) => s.tran_type === 'SalesOrd')!;
      const edits = async (recType: string, id: string) => {
        const lines = await ns.suiteQL(`SELECT id, item, itemtype, quantity, rate FROM transactionline WHERE transaction = ${id} AND mainline = 'F' AND taxline = 'F'`);
        const patch: any[] = [];
        for (const l of lines) {
          if (l.itemtype === 'Discount') { if (-Number(l.rate) !== shopDiscount) patch.push({ line: Number(l.id), item: { id: String(l.item) }, rate: -shopDiscount }); continue; }
          if (l.itemtype === 'ShipItem') continue;
          const sp = shopPrice.get(items.get(String(l.item)) ?? '');
          if (sp !== undefined && Number(l.rate) !== sp) patch.push({ line: Number(l.id), item: { id: String(l.item) }, price: { id: '-1' }, rate: sp, amount: Math.round(sp * Math.abs(Number(l.quantity)) * 100) / 100 });
        }
        if (patch.length) await ns.updateRecord(recType, id, { item: { items: patch } });
        return patch.length;
      };
      const nInv = await edits('invoice', inv.ns_transaction_id);
      let nSo = 0; try { nSo = await edits('salesOrder', so.ns_transaction_id); } catch (e: any) { console.log(`  (#${name} SO edit refused: ${String(e?.message).slice(0, 120)})`); }
      const [afterInv] = await ns.suiteQL(`SELECT foreigntotal FROM transaction WHERE id = ${inv.ns_transaction_id}`);
      if (Math.abs(Number(afterInv.foreigntotal) - charged) > 0.005) { console.log(`✗ #${name}: invoice now $${afterInv.foreigntotal} but Shopify charged $${charged.toFixed(2)} — stopping before touching the payment`); continue; }
      const pays = await paymentFor(ns, inv.ns_transaction_id);
      if (pays.length !== 1) { console.log(`✗ #${name}: expected 1 payment, found ${pays.length} — payment untouched`); continue; }
      await ns.updateRecord('customerpayment', pays[0], { payment: charged, apply: { items: [{ doc: Number(inv.ns_transaction_id), apply: true, amount: charged }] } });
      const chk = await ns.suiteQL(`SELECT id, tranid, foreigntotal, foreignamountunpaid FROM transaction WHERE id IN (${inv.ns_transaction_id}, ${so.ns_transaction_id}, ${pays[0]})`);
      console.log(`✓ #${name}: ${nInv} invoice lines + ${nSo} SO lines corrected → ${chk.map((r: any) => `${r.tranid} $${r.foreigntotal}${r.foreignamountunpaid !== undefined ? ` (unpaid ${r.foreignamountunpaid})` : ''}`).join(' · ')} · Shopify $${charged.toFixed(2)}`);
    } catch (e: any) { console.log(`✗ #${name}: ${String(e?.message ?? e).slice(0, 250)}`); }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
