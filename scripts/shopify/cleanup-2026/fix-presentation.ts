/**
 * "Presentation only" orders — NetScore over-invoiced, the bookkeeper took
 * the difference as "discount taken" on the customer payment (Dr 420000).
 * Net was right; gross and the payment weren't Shopify's. Fix IN PLACE:
 *   invoice/SO product lines → Shopify as-sold per rule (b): Pro Discount
 *   allocations netted into the line price; genuine promo/manual
 *   allocations → header discount (discountRate, → 420000); stray
 *   discount lines zeroed; NetScore "Shopify Tax Item" → 1464 (240504);
 *   payment → disc 0, full invoice applied.
 * Dry-run by default; `--apply` writes to PRODUCTION.
 *   NODE_PATH=$PWD/node_modules SHOPIFY_ADMIN_TOKEN= npx tsx scripts/shopify/cleanup-2026/fix-presentation.ts [--apply] 5621 5851 ...
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import axios from 'axios';
import { shopifyGraphQL } from '../../../lib/shopify/client';
import { createNetSuiteForTarget } from '../../../lib/shopify/engine/nsTarget';
import { PRODUCTION_ENGINE_CONFIG as CFG } from '../../../lib/shopify/engine/config';

const APPLY = process.argv.includes('--apply');
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const r2 = (n: number) => Math.round(n * 100) / 100;
const isPro = (t: string) => /^pro\b/i.test((t ?? '').trim());
async function rest(ns: any, method: string, p: string, data?: any) {
  const url = `${ns.baseUrl}${p}`;
  const res = await axios({ method, url, headers: { Authorization: ns.getAuthHeader(url, method), Accept: 'application/json', 'Content-Type': 'application/json' }, data: data ? JSON.stringify(data) : undefined, validateStatus: () => true });
  if (res.status >= 400) throw new Error(`${method} ${p} → ${res.status} ${res.data?.['o:errorDetails']?.map((d: any) => d.detail).join(' | ') ?? ''}`);
  return res.data;
}
async function applying(ns: any, invoiceId: string) {
  const scriptId = process.env.NETSUITE_INVPDF_SCRIPT_ID!, deployId = process.env.NETSUITE_INVPDF_DEPLOY_ID!;
  const acct = process.env.NETSUITE_ACCOUNT_ID!.toLowerCase().replace(/_/g, '-');
  const url = `https://${acct}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?${new URLSearchParams({ script: scriptId, deploy: deployId, paymentForInvoice: invoiceId, debug: '1' })}`;
  const res = await axios({ method: 'GET', url, headers: { Authorization: ns.getAuthHeader(url, 'GET'), Accept: 'application/json', 'Content-Type': 'application/json' }, validateStatus: () => true });
  return res.status < 400 ? (res.data?.applying ?? []) : [];
}
async function gl(ns: any, id: string) {
  const rows = await ns.suiteQL(`SELECT a.acctnumber, tal.amount FROM transactionaccountingline tal JOIN account a ON a.id = tal.account WHERE tal.transaction = ${id} AND tal.posting = 'T'`);
  const by = new Map<string, number>(); for (const g of rows) by.set(String(g.acctnumber), r2((by.get(String(g.acctnumber)) ?? 0) + Number(g.amount)));
  return [...by.entries()].filter(([, v]) => v !== 0).map(([a, v]) => `${a} ${v}`).join(' · ');
}

async function main() {
  const ns: any = createNetSuiteForTarget('production');
  console.log(APPLY ? '*** APPLY MODE — writing to PRODUCTION NetSuite ***' : '--- DRY RUN (no writes) ---');
  for (const name of names) {
    try {
      const d = await shopifyGraphQL(`{ orders(first: 1, query: "name:#${name}") { nodes { id taxLines { title channelLiable priceSet { shopMoney { amount } } }
        shippingLines(first: 3) { nodes { discountedPriceSet { shopMoney { amount } } } }
        lineItems(first: 30) { nodes { sku quantity originalTotalSet { shopMoney { amount } } discountAllocations { allocatedAmountSet { shopMoney { amount } } discountApplication { ... on AutomaticDiscountApplication { title } ... on ManualDiscountApplication { title } ... on DiscountCodeApplication { code } } } } }
        transactions(first: 10) { kind status amountSet { shopMoney { amount } } } } } }`);
      const o = d.orders.nodes[0];
      const charged = r2(o.transactions.filter((t: any) => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS').reduce((s: number, t: any) => s + Number(t.amountSet.shopMoney.amount), 0));
      const ship = r2(o.shippingLines.nodes.reduce((s: number, l: any) => s + Number(l.discountedPriceSet.shopMoney.amount), 0));
      const tax = r2(o.taxLines.reduce((s: number, t: any) => s + Number(t.priceSet.shopMoney.amount), 0));
      const channelTax = o.taxLines.some((t: any) => t.channelLiable === true);
      // per-SKU targets: net of Pro allocations; promo allocations → header discount
      const target = new Map<string, { qty: number; net: number }>(); let promo = 0; const promoNames = new Set<string>();
      for (const l of o.lineItems.nodes) {
        let pro = 0;
        for (const a of l.discountAllocations) { const t = a.discountApplication?.title ?? a.discountApplication?.code ?? ''; const amt = Number(a.allocatedAmountSet.shopMoney.amount); if (isPro(t)) pro += amt; else { promo += amt; promoNames.add(t); } }
        const prev = target.get(l.sku); target.set(l.sku, { qty: (prev?.qty ?? 0) + l.quantity, net: r2((prev?.net ?? 0) + Number(l.originalTotalSet.shopMoney.amount) - pro) });
      }
      promo = r2(promo);
      const expected = r2([...target.values()].reduce((s, v) => s + v.net, 0) - promo + ship + tax);
      const recs = await ns.suiteQL(`SELECT id, tranid, type, foreigntotal FROM transaction WHERE memo = '${name}' AND type IN ('SalesOrd','CustInvc')`);
      const inv = recs.find((r: any) => r.type === 'CustInvc'), so = recs.find((r: any) => r.type === 'SalesOrd');
      if (!inv) { console.log(`✗ #${name}: invoice not found by memo`); continue; }
      console.log(`\n#${name} · Shopify charged $${charged} = net lines $${r2([...target.values()].reduce((s, v) => s + v.net, 0))}${promo ? ` − promo $${promo} [${[...promoNames].join(', ')}]` : ''} + ship $${ship} + tax $${tax} → expected $${expected}${expected !== charged ? '  ✗ MISMATCH' : ''} · NS ${inv.tranid} $${inv.foreigntotal}`);
      if (expected !== charged) { console.log(`  stopping: Shopify math does not reconcile`); continue; }
      const plan = async (type: string, id: string) => {
        const items = (await rest(ns, 'GET', `/record/v1/${type}/${id}/item?expandSubResources=true`)).items ?? [];
        const patch: any[] = []; const notes: string[] = [];
        for (const it of items) {
          const ref = String(it.item?.refName ?? ''); const sku = ref.split(' ')[0]; const tg = target.get(sku);
          if (tg) { const lineNet = r2(tg.net * (it.quantity / tg.qty)); if (Math.abs(Number(it.amount) - lineNet) > 0.005) { patch.push({ line: it.line, item: { id: it.item.id }, price: { id: '-1' }, rate: r2(lineNet / it.quantity), amount: lineNet }); notes.push(`${sku}×${it.quantity} $${it.amount}→$${lineNet}`); } continue; }
          if (/Shopify Discount/i.test(ref) || /discount/i.test(String(it.item?.refName ?? '')) && Number(it.amount) < 0) { if (Number(it.amount) !== 0) { patch.push({ line: it.line, item: { id: it.item.id }, rate: 0, amount: 0 }); notes.push(`${ref} $${it.amount}→$0 (zeroed)`); } continue; }
          if (/Shopify Tax Item/i.test(ref)) { const taxItem = channelTax ? CFG.taxItems.channelLiable : CFG.taxItems.merchantLiable; patch.push({ line: it.line, item: { id: taxItem }, quantity: 1, price: { id: '-1' }, rate: tax, amount: tax, description: channelTax ? 'Marketplace tax (Shop-remitted)' : 'TAX (DDP pass-through)' }); notes.push(`${ref} $${it.amount}→item ${taxItem} $${tax}`); continue; }
        }
        const hdr = await rest(ns, 'GET', `/record/v1/${type}/${id}?fields=total,discountRate,discountTotal`);
        const curDisc = r2(Number(hdr.discountTotal ?? 0));
        const body: any = {}; if (patch.length) body.item = { items: patch };
        if (Math.abs(curDisc + promo) > 0.005) { body.discountRate = promo ? -promo : 0; if (promo) body.discountItem = { id: CFG.discountItemId }; notes.push(`header discount ${curDisc}→${promo ? -promo : 0}`); }
        return { body, notes, total: hdr.total };
      };
      const pi = await plan('invoice', String(inv.id));
      console.log(`  invoice: ${pi.notes.join(', ') || 'no change'}`);
      let ps: any = null; if (so) { ps = await plan('salesOrder', String(so.id)); console.log(`  SO ${so.tranid}: ${ps.notes.join(', ') || 'no change'}`); }
      const pays = [...new Set((await applying(ns, String(inv.id))).filter((a: any) => /^payment/i.test(a.tranid)).map((a: any) => String(a.id)))];
      if (pays.length !== 1) { console.log(`✗ #${name}: expected 1 payment, found ${pays.length}`); continue; }
      const ap = (await rest(ns, 'GET', `/record/v1/customerpayment/${pays[0]}/apply?expandSubResources=true`)).items ?? [];
      const line = ap.find((a: any) => String(a.doc?.id ?? a.doc) === String(inv.id));
      console.log(`  payment ${pays[0]}: applied $${line?.amount} disc $${line?.disc ?? 0} → applied $${charged} disc $0`);
      if (!APPLY) continue;
      if (Object.keys(pi.body).length) await rest(ns, 'PATCH', `/record/v1/invoice/${inv.id}`, pi.body);
      if (ps && Object.keys(ps.body).length) { try { await rest(ns, 'PATCH', `/record/v1/salesOrder/${so.id}`, ps.body); } catch (e: any) { console.log(`  (SO edit refused: ${String(e.message).slice(0, 140)})`); } }
      const after = await rest(ns, 'GET', `/record/v1/invoice/${inv.id}?fields=total,discountTotal`);
      if (Math.abs(Number(after.total) - charged) > 0.005) { console.log(`✗ #${name}: invoice now $${after.total} ≠ charged $${charged} — STOP, payment untouched`); continue; }
      await ns.updateRecord('customerpayment', pays[0], { payment: charged, apply: { items: [{ doc: Number(inv.id), apply: true, amount: charged, disc: 0 }] } });
      const [pchk] = await ns.suiteQL(`SELECT tranid, foreigntotal FROM transaction WHERE id = ${pays[0]}`);
      const [ichk] = await ns.suiteQL(`SELECT foreignamountunpaid FROM transaction WHERE id = ${inv.id}`);
      console.log(`✓ #${name}: invoice $${after.total} (discount ${after.discountTotal ?? 0}, unpaid ${ichk.foreignamountunpaid}) · ${pchk.tranid} $${pchk.foreigntotal} · invoice GL: ${await gl(ns, String(inv.id))} · payment GL: ${await gl(ns, pays[0])}`);
    } catch (e: any) { console.log(`✗ #${name}: ${String(e?.message ?? e).slice(0, 300)}`); }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
