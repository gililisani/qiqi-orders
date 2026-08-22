// Read-only: Shopify refund facts + NS chain state for the Group C/D orders.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { shopifyGraphQL } from '../../../lib/shopify/client';
import { createNetSuiteForTarget } from '../../../lib/shopify/engine/nsTarget';
import { normalizeNsDate } from '../../../lib/netsuite';

async function applying(ns: any, invoiceId: string) {
  const scriptId = process.env.NETSUITE_INVPDF_SCRIPT_ID!, deployId = process.env.NETSUITE_INVPDF_DEPLOY_ID!;
  const acct = process.env.NETSUITE_ACCOUNT_ID!.toLowerCase().replace(/_/g, '-');
  const url = `https://${acct}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?${new URLSearchParams({ script: scriptId, deploy: deployId, paymentForInvoice: invoiceId, debug: '1' })}`;
  const res = await axios({ method: 'GET', url, headers: { Authorization: ns.getAuthHeader(url, 'GET'), Accept: 'application/json', 'Content-Type': 'application/json' }, validateStatus: () => true });
  return res.status < 400 ? (res.data?.applying ?? []) : [{ error: `HTTP ${res.status}` }];
}

async function main() {
  const ns: any = createNetSuiteForTarget('production');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const itemNames = new Map((await ns.suiteQL(`SELECT id, itemid, itemtype FROM item`)).map((r: any) => [String(r.id), `${r.itemid}`]));
  for (const name of process.argv.slice(2)) {
    const d = await shopifyGraphQL(`{ orders(first: 1, query: "name:#${name}") { nodes { id name createdAt displayFinancialStatus displayFulfillmentStatus
      currentTotalPriceSet { shopMoney { amount } } totalRefundedSet { shopMoney { amount } } currentTotalDiscountsSet { shopMoney { amount } } currentShippingPriceSet { shopMoney { amount } }
      totalTaxSet { shopMoney { amount } } taxLines { title rate channelLiable priceSet { shopMoney { amount } } }
      lineItems(first: 30) { nodes { id sku title quantity originalUnitPriceSet { shopMoney { amount } } discountedTotalSet { shopMoney { amount } } } }
      transactions(first: 20) { id kind status gateway createdAt amountSet { shopMoney { amount } } }
      refunds(first: 10) { id createdAt note totalRefundedSet { shopMoney { amount } }
        refundLineItems(first: 30) { nodes { quantity restocked restockType subtotalSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } } lineItem { sku } } }
        transactions(first: 10) { nodes { id kind status gateway createdAt amountSet { shopMoney { amount } } } } } } } }`);
    const o = d.orders.nodes[0]; const sid = o.id.replace(/^.*\//, '');
    console.log(`\n================ #${name} (gid ${sid}) · ${o.createdAt} · ${o.displayFinancialStatus}/${o.displayFulfillmentStatus} · total $${o.currentTotalPriceSet.shopMoney.amount} · refunded $${o.totalRefundedSet.shopMoney.amount} · discount $${o.currentTotalDiscountsSet.shopMoney.amount} · ship $${o.currentShippingPriceSet.shopMoney.amount} · tax $${o.totalTaxSet.shopMoney.amount}`);
    for (const t of o.taxLines) console.log(`  tax: ${t.title} ${t.rate} channelLiable=${t.channelLiable} $${t.priceSet.shopMoney.amount}`);
    for (const l of o.lineItems.nodes) console.log(`  line: ${l.sku} ×${l.quantity} @ $${l.originalUnitPriceSet.shopMoney.amount} → $${l.discountedTotalSet.shopMoney.amount}  (${l.title})`);
    for (const t of o.transactions) console.log(`  txn: ${t.kind} ${t.status} ${t.gateway} $${t.amountSet.shopMoney.amount} ${t.createdAt} id=${t.id.replace(/^.*\//, '')}`);
    for (const r of o.refunds) {
      console.log(`  REFUND ${r.id.replace(/^.*\//, '')} ${r.createdAt} $${r.totalRefundedSet.shopMoney.amount} note=${JSON.stringify(r.note)}`);
      for (const rl of r.refundLineItems.nodes) console.log(`    rl: ${rl.lineItem.sku} ×${rl.quantity} subtotal $${rl.subtotalSet.shopMoney.amount} tax $${rl.totalTaxSet.shopMoney.amount} restocked=${rl.restocked} ${rl.restockType}`);
      for (const t of r.transactions.nodes) console.log(`    rtxn: ${t.kind} ${t.status} ${t.gateway} $${t.amountSet.shopMoney.amount} ${t.createdAt} id=${t.id.replace(/^.*\//, '')}`);
    }
    const { data: st } = await db.from('netscore_transaction_stamps').select('ns_transaction_id, tran_type, tran_id').eq('shopify_order_id', sid).eq('ns_target', 'production');
    const ids = new Set<string>((st ?? []).map((s) => String(s.ns_transaction_id)));
    const extra = await ns.suiteQL(`SELECT id, type FROM transaction WHERE (memo = '${name}' OR memo LIKE '%#${name}%' OR otherrefnum = '#${name}' OR otherrefnum = '${name}' OR externalid LIKE '%${sid}%')`);
    for (const e of extra) ids.add(String(e.id));
    // IFs created from any SO found
    for (const id of [...ids]) { const ifs = await ns.suiteQL(`SELECT DISTINCT tl.transaction AS id FROM transactionline tl JOIN transaction t ON t.id = tl.transaction WHERE tl.createdfrom = ${id} AND t.type IN ('ItemShip','CustCred','CustRfnd','CustInvc')`); for (const f of ifs) ids.add(String(f.id)); }
    if (!ids.size) { console.log('  NS: NOTHING FOUND'); continue; }
    const hdrs = await ns.suiteQL(`SELECT id, tranid, type, trandate, foreigntotal, foreignamountunpaid, status, entity, memo, otherrefnum, externalid FROM transaction WHERE id IN (${[...ids].join(',')}) ORDER BY id`);
    for (const hdr of hdrs) {
      console.log(`  ${hdr.type} ${hdr.tranid ?? ''} (id ${hdr.id}): ${normalizeNsDate(hdr.trandate)} total $${hdr.foreigntotal} unpaid ${hdr.foreignamountunpaid ?? '-'} status ${hdr.status} entity ${hdr.entity} memo=${JSON.stringify(hdr.memo)} ext=${hdr.externalid ?? ""}`);
      const lines = await ns.suiteQL(`SELECT id, item, itemtype, quantity, rate, foreignamount, location, memo FROM transactionline WHERE transaction = ${hdr.id} AND mainline = 'F' AND taxline = 'F' ORDER BY id`);
      for (const l of lines) console.log(`     L${l.id} ${itemNames.get(String(l.item)) ?? l.item} [${l.itemtype}] qty ${l.quantity} rate ${l.rate} amt ${l.foreignamount} loc ${l.location} ${l.memo ? `memo=${JSON.stringify(l.memo)}` : ''}`);
      if (hdr.type === 'CustPymt' || hdr.type === 'CustRfnd' || hdr.type === 'CustCred') {
        const al = await ns.suiteQL(`SELECT a.acctnumber, a.fullname, tal.amount, tl.cleared FROM transactionline tl JOIN transactionaccountingline tal ON tal.transaction = tl.transaction AND tal.transactionline = tl.id JOIN account a ON a.id = tal.account WHERE tl.transaction = ${hdr.id}`);
        console.log(`     GL: ${al.map((x: any) => `${x.acctnumber} ${x.fullname} ${x.amount}${x.cleared === 'T' ? ' CLEARED' : ''}`).join(' · ')}`);
      }
      if (hdr.type === 'CustInvc') {
        const ap = await applying(ns, String(hdr.id));
        console.log(`     applying: ${ap.map((a: any) => `${a.tranid ?? a.error} (id ${a.id}) $${a.amount ?? ''}`).join(' · ') || '—'}`);
        for (const a of ap.filter((a: any) => a.id && !ids.has(String(a.id)))) {
          const p = (await ns.suiteQL(`SELECT id, tranid, type, trandate, foreigntotal, memo FROM transaction WHERE id = ${a.id}`))[0];
          const al = await ns.suiteQL(`SELECT a.acctnumber, a.fullname, tal.amount, tl.cleared FROM transactionline tl JOIN transactionaccountingline tal ON tal.transaction = tl.transaction AND tal.transactionline = tl.id JOIN account a ON a.id = tal.account WHERE tl.transaction = ${a.id}`);
          console.log(`     ${p?.type} ${p?.tranid} (id ${p?.id}) ${normalizeNsDate(p?.trandate)} $${p?.foreigntotal} memo=${JSON.stringify(p?.memo)} → ${al.map((x: any) => `${x.acctnumber} ${x.amount}${x.cleared === 'T' ? ' CLEARED' : ''}`).join(', ')}`);
        }
      }
    }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 400)); process.exit(1); });
