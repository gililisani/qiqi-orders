/**
 * Group C — NetScore booked partial refunds NET (invoice + payment shrunk,
 * no credit memo, no customer refund). Restructure IN PLACE to the live
 * engine's representation: invoice at what Shopify charged (lines at
 * Shopify prices; cancelled lines re-added linked to their SO line),
 * payment = charged, Credit Memo on the Refund Adjustment item (1565,
 * no inventory) dated the Shopify refund date, Customer Refund from the
 * gateway clearing account, cancelled SO lines closed. Inventory never
 * moves (IFs untouched).
 *
 * Dry-run by default — prints the plan. `--apply` writes to PRODUCTION.
 *   NODE_PATH=$PWD/node_modules SHOPIFY_ADMIN_TOKEN= npx tsx scripts/shopify/cleanup-2026/fix-refund-restructure.ts [--apply] 5789 5804 5828 6499
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import axios from 'axios';
import { shopifyGraphQL } from '../../../lib/shopify/client';
import { createNetSuiteForTarget } from '../../../lib/shopify/engine/nsTarget';
import { PRODUCTION_ENGINE_CONFIG as CFG, gatewayAccountId } from '../../../lib/shopify/engine/config';
import { storeDate } from '../../../lib/shopify/core/dates';
import { normalizeNsDate } from '../../../lib/netsuite';

const APPLY = process.argv.includes('--apply');
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const r2 = (n: number) => Math.round(n * 100) / 100;

async function applying(ns: any, invoiceId: string) {
  const scriptId = process.env.NETSUITE_INVPDF_SCRIPT_ID!, deployId = process.env.NETSUITE_INVPDF_DEPLOY_ID!;
  const acct = process.env.NETSUITE_ACCOUNT_ID!.toLowerCase().replace(/_/g, '-');
  const url = `https://${acct}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?${new URLSearchParams({ script: scriptId, deploy: deployId, paymentForInvoice: invoiceId, debug: '1' })}`;
  const res = await axios({ method: 'GET', url, headers: { Authorization: ns.getAuthHeader(url, 'GET'), Accept: 'application/json', 'Content-Type': 'application/json' }, validateStatus: () => true });
  return res.status < 400 ? (res.data?.applying ?? []) : [];
}

async function glSummary(ns: any, ids: string[]) {
  const rows = await ns.suiteQL(`SELECT t.tranid, t.type, a.acctnumber, tal.amount FROM transactionaccountingline tal JOIN transaction t ON t.id = tal.transaction JOIN account a ON a.id = tal.account WHERE tal.transaction IN (${ids.join(',')}) AND tal.posting = 'T'`);
  const byAcct = new Map<string, number>();
  for (const r of rows) byAcct.set(String(r.acctnumber), r2((byAcct.get(String(r.acctnumber)) ?? 0) + Number(r.amount)));
  return { rows, byAcct };
}

async function main() {
  const ns: any = createNetSuiteForTarget('production');
  const items: any[] = await ns.suiteQL(`SELECT id, itemid FROM item WHERE itemid LIKE 'FPS%' OR itemid LIKE 'TOL%'`);
  const idBySku = new Map(items.map((r) => [r.itemid, String(r.id)])), skuById = new Map(items.map((r) => [String(r.id), r.itemid]));
  console.log(APPLY ? '*** APPLY MODE — writing to PRODUCTION NetSuite ***' : '--- DRY RUN (no writes) ---');
  for (const name of names) {
    try {
      const d = await shopifyGraphQL(`{ orders(first: 1, query: "name:#${name}") { nodes { id name currentTotalDiscountsSet { shopMoney { amount } } currentShippingPriceSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } }
        lineItems(first: 30) { nodes { sku quantity originalUnitPriceSet { shopMoney { amount } } } }
        transactions(first: 20) { id kind status gateway amountSet { shopMoney { amount } } }
        refunds(first: 10) { id createdAt note totalRefundedSet { shopMoney { amount } } refundLineItems(first: 30) { nodes { quantity restockType subtotalSet { shopMoney { amount } } totalTaxSet { shopMoney { amount } } lineItem { sku } } } transactions(first: 10) { nodes { id kind status gateway amountSet { shopMoney { amount } } } } } } } }`);
      const o = d.orders.nodes[0];
      if (!o) { console.log(`✗ #${name}: not in Shopify`); continue; }
      const charged = r2(o.transactions.filter((t: any) => (t.kind === 'SALE' || t.kind === 'CAPTURE') && t.status === 'SUCCESS').reduce((s: number, t: any) => s + Number(t.amountSet.shopMoney.amount), 0));
      const refunded = r2(o.refunds.reduce((s: number, r: any) => s + Number(r.totalRefundedSet.shopMoney.amount), 0));
      if (Number(o.totalTaxSet.shopMoney.amount) || Number(o.currentTotalDiscountsSet.shopMoney.amount)) { console.log(`✗ #${name}: has tax/discount — this script only handles plain orders; skipping`); continue; }
      const shopLines = o.lineItems.nodes.map((l: any) => ({ sku: l.sku, qty: Number(l.quantity), rate: Number(l.originalUnitPriceSet.shopMoney.amount) }));
      const ship = Number(o.currentShippingPriceSet.shopMoney.amount);
      const expectInvoice = r2(shopLines.reduce((s: number, l: any) => s + l.qty * l.rate, 0) + ship);
      if (expectInvoice !== charged) { console.log(`✗ #${name}: lines+shipping $${expectInvoice} ≠ charged $${charged}; skipping`); continue; }

      // NS chain by memo (NetScore convention)
      const recs = await ns.suiteQL(`SELECT id, tranid, type, foreigntotal, entity, trandate FROM transaction WHERE (memo = '${name}' OR memo = '#${name}' OR otherrefnum = '${name}' OR otherrefnum = '#${name}') ORDER BY id`);
      const so = recs.find((r: any) => r.type === 'SalesOrd'), inv = recs.find((r: any) => r.type === 'CustInvc');
      const cms = recs.filter((r: any) => r.type === 'CustCred'), rfds = recs.filter((r: any) => r.type === 'CustRfnd');
      if (!so || !inv) { console.log(`✗ #${name}: SO/invoice not found by memo`); continue; }
      const pays = [...new Set((await applying(ns, String(inv.id))).filter((a: any) => /^payment/i.test(a.tranid)).map((a: any) => String(a.id)))];
      if (pays.length !== 1) { console.log(`✗ #${name}: expected 1 payment on ${inv.tranid}, found ${pays.length}; skipping`); continue; }
      const [pay] = await ns.suiteQL(`SELECT id, tranid, foreigntotal FROM transaction WHERE id = ${pays[0]}`);
      console.log(`\n#${name} · Shopify charged $${charged}, refunded $${refunded}, net $${r2(charged - refunded)} · NS ${so.tranid} $${so.foreigntotal} / ${inv.tranid} $${inv.foreigntotal} / ${pay.tranid} $${pay.foreigntotal} / CMs ${cms.map((c: any) => `${c.tranid} $${Math.abs(Number(c.foreigntotal))}`).join(',') || 'none'} / refunds ${rfds.map((c: any) => `$${Math.abs(Number(c.foreigntotal))}`).join(',') || 'none'}`);

      // 1. line edits on invoice + SO
      const soLines = await ns.suiteQL(`SELECT id, item, itemtype, quantity, rate, isclosed FROM transactionline WHERE transaction = ${so.id} AND mainline = 'F' AND taxline = 'F' ORDER BY id`);
      const planEdits = async (recType: string, id: string, isInvoice: boolean) => {
        const lines = await ns.suiteQL(`SELECT id, item, itemtype, quantity, rate FROM transactionline WHERE transaction = ${id} AND mainline = 'F' AND taxline = 'F' ORDER BY id`);
        const patch: any[] = []; const seen = new Set<string>();
        for (const l of lines) {
          if (l.itemtype !== 'Assembly' && l.itemtype !== 'InvtPart') continue;
          const sku = skuById.get(String(l.item)); if (!sku) continue; // components of assemblies have no FPS sku
          const sl = shopLines.find((s: any) => s.sku === sku); if (!sl) continue;
          seen.add(sku);
          if (Number(l.rate) !== sl.rate || Math.abs(Number(l.quantity)) !== sl.qty) patch.push({ line: Number(l.id), item: { id: String(l.item) }, price: { id: '-1' }, rate: sl.rate, quantity: sl.qty, amount: r2(sl.rate * sl.qty), _was: `${sku} ${Math.abs(Number(l.quantity))}×$${l.rate}` });
        }
        const adds: any[] = [];
        if (isInvoice) for (const sl of shopLines) {
          if (seen.has(sl.sku)) continue;
          const itemId = idBySku.get(sl.sku); const soLine = soLines.find((x: any) => String(x.item) === itemId);
          if (!itemId || !soLine) { throw new Error(`${sl.sku} missing on invoice and not found on SO`); }
          if (Number(soLine.rate) !== sl.rate || Math.abs(Number(soLine.quantity)) !== sl.qty) throw new Error(`${sl.sku}: SO line ${soLine.id} is ${Math.abs(Number(soLine.quantity))}×$${soLine.rate}, Shopify ${sl.qty}×$${sl.rate} — fix the SO first`);
          adds.push({ sku: sl.sku, amount: r2(sl.rate * sl.qty), _was: `${sl.sku} ${sl.qty}×$${sl.rate} is unbilled on the SO → bill it on a SECOND invoice transformed from ${so.tranid} (SO-linked, no inventory impact)` });
        }
        return { patch, adds };
      };
      const invPlan = await planEdits('invoice', String(inv.id), true), soPlan = await planEdits('salesOrder', String(so.id), false);
      for (const p of invPlan.patch) console.log(`  invoice L${p.line}: ${p._was} → ${p.quantity}×$${p.rate}`);
      for (const a of invPlan.adds) console.log(`  ${a._was}`);
      const addTotal = r2(invPlan.adds.reduce((t: number, a: any) => t + a.amount, 0));
      const existingInv2 = recs.filter((r: any) => r.type === 'CustInvc' && String(r.id) !== String(inv.id));
      if (existingInv2.length) console.log(`  (other invoices on this order: ${existingInv2.map((r: any) => `${r.tranid} $${r.foreigntotal}`).join(', ')})`);
      for (const p of soPlan.patch) console.log(`  SO L${p.line}: ${p._was} → ${p.quantity}×$${p.rate}`);
      console.log(`  payment ${pay.tranid}: $${pay.foreigntotal} → $${charged}`);

      // 2. CM + refund plan per Shopify refund
      const cmPlans: any[] = [];
      for (const rf of o.refunds) {
        const amt = r2(Number(rf.totalRefundedSet.shopMoney.amount));
        const existing = cms.find((c: any) => Math.abs(Math.abs(Number(c.foreigntotal)) - amt) < 0.005);
        const lines: any[] = []; let lineSum = 0;
        for (const rl of rf.refundLineItems.nodes) {
          const sub = r2(Number(rl.subtotalSet.shopMoney.amount)); lineSum = r2(lineSum + sub);
          lines.push({ item: { id: CFG.refundAdjustmentItemId }, quantity: Number(rl.quantity), price: { id: '-1' }, rate: r2(sub / Number(rl.quantity)), amount: sub, description: `Refund · ${rl.lineItem.sku} ×${rl.quantity}${rl.restockType === 'CANCEL' ? ' (cancelled, not shipped)' : ''}` });
        }
        const residual = r2(amt - lineSum);
        if (residual > 0) lines.push({ item: { id: CFG.refundAdjustmentItemId }, quantity: 1, price: { id: '-1' }, rate: residual, amount: residual, description: residual <= ship ? 'Refunded shipping' : 'Refund adjustment (amount-only)' });
        if (residual < 0) {
          // Shopify lists the full line value but only part of it was refunded (partial price adjustment) → one amount-only line naming the SKUs.
          const skus = rf.refundLineItems.nodes.map((rl: any) => `${rl.lineItem.sku} ×${rl.quantity}`).join(', ');
          lines.length = 0;
          lines.push({ item: { id: CFG.refundAdjustmentItemId }, quantity: 1, price: { id: '-1' }, rate: amt, amount: amt, description: `Refund adjustment (partial $${amt} of $${lineSum} on ${skus})` });
        }
        const txns = rf.transactions.nodes.filter((t: any) => t.kind === 'REFUND' && t.status === 'SUCCESS');
        const cancelSkus = rf.refundLineItems.nodes.filter((rl: any) => rl.restockType === 'CANCEL').map((rl: any) => rl.lineItem.sku);
        cmPlans.push({ rf, amt, existing, lines, txns, cancelSkus });
        const date = storeDate(rf.createdAt);
        if (existing) console.log(`  CM $${amt} (${date}): EXISTS ${existing.tranid} — keep`);
        else console.log(`  CM $${amt} dated ${date}: ${lines.map((l) => `${l.description} $${l.amount}`).join(' · ')} · memo "Shopify refund #${name}${rf.note ? ` · ${rf.note}` : ''}"`);
        for (const t of txns) {
          const acct = gatewayAccountId(CFG, t.gateway);
          const existsR = rfds.find((r: any) => Math.abs(Math.abs(Number(r.foreigntotal)) - Number(t.amountSet.shopMoney.amount)) < 0.005);
          console.log(`  customer refund $${t.amountSet.shopMoney.amount} ${date} from ${t.gateway} (acct ${acct}): ${existsR ? 'EXISTS — keep' : 'create'}`);
        }
        for (const sku of cancelSkus) { const sl = soLines.find((x: any) => skuById.get(String(x.item)) === sku); console.log(`  SO line ${sl?.id} ${sku}: close (cancelled, unshipped)${sl?.isclosed === 'T' ? ' — already closed' : ''}`); }
      }
      if (!APPLY) continue;

      // ---- APPLY ----
      const strip = (arr: any[]) => arr.map(({ _was, ...rest }) => rest);
      if (invPlan.patch.length) await ns.updateRecord('invoice', String(inv.id), { item: { items: strip(invPlan.patch) } });
      const invoiceIds: string[] = [String(inv.id)];
      let inv2Id: string | null = existingInv2.find((r: any) => Math.abs(Number(r.foreigntotal) - addTotal) < 0.005)?.id ? String(existingInv2.find((r: any) => Math.abs(Number(r.foreigntotal) - addTotal) < 0.005).id) : null;
      if (invPlan.adds.length && !inv2Id) {
        inv2Id = await ns.transformRecord('salesOrder', String(so.id), 'invoice', { tranDate: normalizeNsDate(inv.trandate), memo: String(name), otherRefNum: String(name) });
        const [i2] = await ns.suiteQL(`SELECT tranid, foreigntotal FROM transaction WHERE id = ${inv2Id}`);
        console.log(`  created invoice ${i2.tranid} (id ${inv2Id}) $${i2.foreigntotal} from ${so.tranid}`);
        if (Math.abs(Number(i2.foreigntotal) - addTotal) > 0.005) { console.log(`✗ #${name}: second invoice $${i2.foreigntotal} ≠ expected $${addTotal} — STOP; delete/inspect ${i2.tranid} manually`); continue; }
      }
      if (inv2Id) invoiceIds.push(inv2Id);
      if (soPlan.patch.length) { try { await ns.updateRecord('salesOrder', String(so.id), { item: { items: strip(soPlan.patch) } }); } catch (e: any) { console.log(`  (SO edit refused: ${String(e?.message).slice(0, 160)})`); } }
      const afterInvs = await ns.suiteQL(`SELECT id, foreigntotal FROM transaction WHERE id IN (${invoiceIds.join(',')})`);
      const invTotal = r2(afterInvs.reduce((t: number, r: any) => t + Number(r.foreigntotal), 0));
      if (Math.abs(invTotal - charged) > 0.005) { console.log(`✗ #${name}: invoices now $${invTotal} ≠ charged $${charged} — STOP (payment/CM untouched)`); continue; }
      // inventory guard: no invoice may post COGS/inventory
      const invGl = await ns.suiteQL(`SELECT a.acctnumber, a.accttype, tal.amount FROM transactionaccountingline tal JOIN account a ON a.id = tal.account WHERE tal.transaction IN (${invoiceIds.join(',')}) AND tal.posting = 'T'`);
      const cogs = invGl.filter((g: any) => /COGS|OthAsset|Inventory|OthCurrAsset/i.test(String(g.accttype)) || String(g.acctnumber).startsWith('5') || String(g.acctnumber).startsWith('12'));
      if (cogs.length) { console.log(`✗ #${name}: invoice posts ${cogs.map((g: any) => `${g.acctnumber}/${g.accttype} ${g.amount}`).join(', ')} — inventory moved; STOP`); continue; }
      await ns.updateRecord('customerpayment', String(pay.id), { payment: charged, apply: { items: afterInvs.map((r: any) => ({ doc: Number(r.id), apply: true, amount: Number(r.foreigntotal) })) } });
      const created: string[] = [String(so.id), ...invoiceIds, String(pay.id)];
      for (const p of cmPlans) {
        let cmId = p.existing ? String(p.existing.id) : null;
        const date = storeDate(p.rf.createdAt);
        if (!cmId) {
          const body: any = { externalId: `SHOPCM-${p.rf.id.replace(/^.*\//, '')}`, entity: { id: String(inv.entity) }, subsidiary: { id: CFG.subsidiaryId }, otherRefNum: `#${name}`, tranDate: date, memo: `Shopify refund #${name}${p.rf.note ? ` · ${p.rf.note}` : ''}`, item: { items: p.lines } };
          if (CFG.creditMemoLocationId) body.location = { id: CFG.creditMemoLocationId };
          try { cmId = await ns.createRecord('creditMemo', body); }
          catch (e: any) {
            if (!/Location/.test(String(e?.message)) || body.location) throw e;
            console.log(`  (CM without location refused — retrying with header location 31)`);
            cmId = await ns.createRecord('creditMemo', { ...body, location: { id: '31' } });
          }
          console.log(`  created CM id ${cmId}`);
        }
        created.push(cmId);
        for (const t of p.txns) {
          const existsR = rfds.find((r: any) => Math.abs(Math.abs(Number(r.foreigntotal)) - Number(t.amountSet.shopMoney.amount)) < 0.005);
          if (existsR) { created.push(String(existsR.id)); continue; }
          const rid = await ns.transformRecord('creditMemo', cmId, 'customerrefund', { externalId: `SHOPRFD-${t.id.replace(/^.*\//, '')}`, tranDate: date, account: { id: gatewayAccountId(CFG, t.gateway) }, memo: `Shopify refund #${name} · ${t.gateway}` });
          console.log(`  created customer refund id ${rid}`); created.push(rid);
        }
        for (const sku of p.cancelSkus) {
          const sl = soLines.find((x: any) => skuById.get(String(x.item)) === sku);
          if (sl && sl.isclosed !== 'T') { try { await ns.updateRecord('salesOrder', String(so.id), { item: { items: [{ line: Number(sl.id), isClosed: true }] } }); console.log(`  closed SO line ${sl.id} ${sku}`); } catch (e: any) { console.log(`  (SO line close refused: ${String(e?.message).slice(0, 160)})`); } }
        }
      }
      // read-back
      const chk = await ns.suiteQL(`SELECT tranid, type, trandate, foreigntotal, foreignamountunpaid, status FROM transaction WHERE id IN (${created.join(',')}) ORDER BY id`);
      const { byAcct } = await glSummary(ns, created);
      console.log(`✓ #${name}: ${chk.map((r: any) => `${r.type} ${r.tranid ?? ''} ${normalizeNsDate(r.trandate)} $${r.foreigntotal}${r.foreignamountunpaid != null ? ` (unpaid ${r.foreignamountunpaid})` : ''} [${r.status}]`).join(' · ')}`);
      const clearing = [...byAcct.entries()].filter(([a]) => a.startsWith('1005')).map(([a, v]) => `${a} ${v}`).join(', ');
      console.log(`  GL net: 410000 ${byAcct.get('410000') ?? 0} (Shopify net −$${r2(charged - refunded)}) · clearing ${clearing} (expect +$${r2(charged - refunded)}) · AR ${byAcct.get('101101') ?? 0} (expect 0)`);
    } catch (e: any) { console.log(`✗ #${name}: ${String(e?.message ?? e).slice(0, 300)}`); }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
