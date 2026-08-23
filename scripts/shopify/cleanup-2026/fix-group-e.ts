/**
 * Group E (owner facts 2026-08-23):
 *   #5734 — genuine $0 order (100 % "replacement order shipping issue"),
 *           shipped: invoice/SO get the header discount (−$150 → 420000),
 *           the phantom $150 payment into Undeposited Funds is deleted; IF stays.
 *   #6234 — cancelled in Shopify one minute after creation, manual gateway,
 *           no money moved, never shipped: delete payment, invoice, SO.
 *   #6773 — test order (tag "test"): delete payment, invoice, SO.
 * Dry-run by default; `--apply` writes to PRODUCTION.
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import axios from 'axios';
import { createNetSuiteForTarget } from '../../../lib/shopify/engine/nsTarget';
import { PRODUCTION_ENGINE_CONFIG as CFG } from '../../../lib/shopify/engine/config';

const APPLY = process.argv.includes('--apply');
async function applying(ns: any, invoiceId: string) {
  const scriptId = process.env.NETSUITE_INVPDF_SCRIPT_ID!, deployId = process.env.NETSUITE_INVPDF_DEPLOY_ID!;
  const acct = process.env.NETSUITE_ACCOUNT_ID!.toLowerCase().replace(/_/g, '-');
  const url = `https://${acct}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?${new URLSearchParams({ script: scriptId, deploy: deployId, paymentForInvoice: invoiceId, debug: '1' })}`;
  const res = await axios({ method: 'GET', url, headers: { Authorization: ns.getAuthHeader(url, 'GET'), Accept: 'application/json', 'Content-Type': 'application/json' }, validateStatus: () => true });
  return res.status < 400 ? (res.data?.applying ?? []) : [];
}
async function chain(ns: any, name: string) {
  const recs = await ns.suiteQL(`SELECT id, tranid, type, foreigntotal, status FROM transaction WHERE memo = '${name}' AND type IN ('SalesOrd','CustInvc') ORDER BY id`);
  const so = recs.find((r: any) => r.type === 'SalesOrd'), inv = recs.find((r: any) => r.type === 'CustInvc');
  const pays = inv ? [...new Set((await applying(ns, String(inv.id))).filter((a: any) => /^payment/i.test(a.tranid)).map((a: any) => String(a.id)))] : [];
  const ifs = so ? await ns.suiteQL(`SELECT DISTINCT tl.transaction AS id FROM transactionline tl JOIN transaction t ON t.id = tl.transaction WHERE tl.createdfrom = ${so.id} AND t.type = 'ItemShip'`) : [];
  return { so, inv, pays, ifs: ifs.map((f: any) => String(f.id)) };
}
async function gl(ns: any, id: string) {
  const rows = await ns.suiteQL(`SELECT a.acctnumber, tal.amount FROM transactionaccountingline tal JOIN account a ON a.id = tal.account WHERE tal.transaction = ${id} AND tal.posting = 'T'`);
  const by = new Map<string, number>(); for (const g of rows) { const v = (by.get(String(g.acctnumber)) ?? 0) + Number(g.amount); by.set(String(g.acctnumber), Math.round(v * 100) / 100); }
  return [...by.entries()].filter(([, v]) => v !== 0).map(([a, v]) => `${a} ${v}`).join(' · ') || '(no posting lines)';
}
async function main() {
  const ns: any = createNetSuiteForTarget('production');
  console.log(APPLY ? '*** APPLY MODE — writing to PRODUCTION NetSuite ***' : '--- DRY RUN (no writes) ---');

  // #5734
  {
    const c = await chain(ns, '5734');
    console.log(`\n#5734: ${c.so?.tranid} $${c.so?.foreigntotal} · ${c.inv?.tranid} $${c.inv?.foreigntotal} · payments ${c.pays.join(',') || 'none'} · IFs ${c.ifs.join(',') || 'none'}`);
    console.log(`  plan: delete payment(s) ${c.pays.join(',')} (phantom $150 into 101321) · invoice + SO header discount −150 (item ${CFG.discountItemId} → 420000) · IF untouched`);
    if (APPLY && c.inv && c.so) {
      for (const p of c.pays) { await ns.deleteRecord('customerpayment', p); console.log(`  deleted payment ${p}`); }
      await ns.updateRecord('invoice', String(c.inv.id), { discountItem: { id: CFG.discountItemId }, discountRate: -150 });
      try { await ns.updateRecord('salesOrder', String(c.so.id), { discountItem: { id: CFG.discountItemId }, discountRate: -150 }); } catch (e: any) { console.log(`  (SO edit refused: ${String(e.message).slice(0, 140)})`); }
      const [i] = await ns.suiteQL(`SELECT tranid, foreigntotal, foreignamountunpaid, status FROM transaction WHERE id = ${c.inv.id}`);
      const [s] = await ns.suiteQL(`SELECT tranid, foreigntotal, status FROM transaction WHERE id = ${c.so.id}`);
      console.log(`✓ #5734: ${i.tranid} $${i.foreigntotal} (unpaid ${i.foreignamountunpaid}, ${i.status}) · ${s.tranid} $${s.foreigntotal} [${s.status}] · invoice GL: ${await gl(ns, String(c.inv.id))}`);
    }
  }
  // #6234, #6773 — delete chain
  for (const [name, why] of [['6234', 'cancelled 1 min after creation, manual gateway, no money, never shipped'], ['6773', 'test order']] as const) {
    const c = await chain(ns, name);
    console.log(`\n#${name} (${why}): ${c.so?.tranid ?? '-'} · ${c.inv?.tranid ?? '-'} · payments ${c.pays.join(',') || 'none'} · IFs ${c.ifs.join(',') || 'none'}`);
    if (c.ifs.length) { console.log(`  ✗ has item fulfillments — not deleting`); continue; }
    console.log(`  plan: delete payment(s) → invoice → SO`);
    if (!APPLY) continue;
    for (const p of c.pays) { await ns.deleteRecord('customerpayment', p); console.log(`  deleted payment ${p}`); }
    if (c.inv) { await ns.deleteRecord('invoice', String(c.inv.id)); console.log(`  deleted invoice ${c.inv.tranid}`); }
    if (c.so) { await ns.deleteRecord('salesOrder', String(c.so.id)); console.log(`  deleted SO ${c.so.tranid}`); }
    const left = await ns.suiteQL(`SELECT id, tranid, type FROM transaction WHERE memo = '${name}' OR memo = '#${name}'`);
    console.log(`✓ #${name}: ${left.length ? 'STILL PRESENT: ' + left.map((r: any) => `${r.type} ${r.tranid}`).join(',') : 'nothing left in NetSuite'}`);
  }
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
