import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import fs from 'fs';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { shopifyPaginate } from '../../../lib/shopify/client';
import { createNetSuiteForTarget } from '../../../lib/shopify/engine/nsTarget';
import { storeDate } from '../../../lib/shopify/core/dates';

const c = (a: any) => Math.round(Number(a ?? 0) * 100);
const $ = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const chunks = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function applying(ns: any, invoiceId: string) {
  const scriptId = process.env.NETSUITE_INVPDF_SCRIPT_ID!, deployId = process.env.NETSUITE_INVPDF_DEPLOY_ID!;
  const acct = process.env.NETSUITE_ACCOUNT_ID!.toLowerCase().replace(/_/g, '-');
  const url = `https://${acct}.restlets.api.netsuite.com/app/site/hosting/restlet.nl?${new URLSearchParams({ script: scriptId, deploy: deployId, paymentForInvoice: invoiceId, debug: '1' })}`;
  const res = await axios({ method: 'GET', url, headers: { Authorization: ns.getAuthHeader(url, 'GET'), Accept: 'application/json', 'Content-Type': 'application/json' }, validateStatus: () => true });
  return res.status < 400 ? (res.data?.applying ?? []) : [];
}

async function main() {
  const ns: any = createNetSuiteForTarget('production');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  // 1. Shopify truth
  const orders = await shopifyPaginate<any>(`query A($q: String!, $cursor: String) {
    orders(first: 100, after: $cursor, sortKey: CREATED_AT, query: $q) {
      nodes { id name test createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
        taxLines { channelLiable priceSet { shopMoney { amount } } }
        transactions(first: 20) { kind status gateway amountSet { shopMoney { amount } } } }
      pageInfo { hasNextPage endCursor } } }`, { q: "created_at:>='2026-01-01T00:00:00-05:00'" }, 'orders');
  console.log(`Shopify 2026: ${orders.length} orders`);

  // 2. NS record map (NetScore stamps + our rows)
  const stamps: any[] = [];
  for (let i = 0; ; i += 1000) {
    const { data } = await db.from('netscore_transaction_stamps').select('ns_transaction_id, shopify_order_id, tran_type').eq('ns_target', 'production').range(i, i + 999);
    stamps.push(...(data ?? [])); if (!data || data.length < 1000) break;
  }
  const typesSeen = [...new Set(stamps.map((s) => s.tran_type))];
  console.log('stamp types:', typesSeen.join(', '));
  const recs = new Map<string, Record<string, string[]>>();
  for (const s of stamps) { const e = recs.get(s.shopify_order_id) ?? {}; (e[s.tran_type] ??= []).push(s.ns_transaction_id); recs.set(s.shopify_order_id, e); }
  const { data: ours } = await db.from('shopify_order_sync').select('shopify_order_id, state, ns_so_id, ns_invoice_id, ns_payment_ids, ns_fulfillment_ids, ns_credit_memo_ids');
  for (const r of ours ?? []) {
    if (!r.ns_invoice_id) continue;
    const e = recs.get(r.shopify_order_id) ?? {};
    (e.CustInvc ??= []).push(r.ns_invoice_id); if (r.ns_so_id) (e.SalesOrd ??= []).push(r.ns_so_id);
    (e.CustPymt ??= []).push(...(r.ns_payment_ids ?? [])); (e.ItemShip ??= []).push(...(r.ns_fulfillment_ids ?? [])); (e.CustCred ??= []).push(...(r.ns_credit_memo_ids ?? []));
    recs.set(r.shopify_order_id, e);
  }

  // 2b. Clean-up-era records (2026-08-22 groups A/C): IFs and second invoices
  // transformed from NetScore SOs, CMs keyed by otherrefnum '#name' or SHOPCM-.
  const soOwner = new Map<string, string>();
  for (const [oid, e] of recs) for (const so of e.SalesOrd ?? []) soOwner.set(String(so), oid);
  for (const ch of chunks([...soOwner.keys()].map(Number).filter(Boolean), 200)) {
    const rows = await ns.suiteQL(`SELECT DISTINCT tl.transaction AS id, tl.createdfrom AS so, t.type FROM transactionline tl JOIN transaction t ON t.id = tl.transaction WHERE t.type IN ('ItemShip','CustInvc') AND tl.createdfrom IN (${ch.join(',')})`);
    for (const r of rows) { const oid = soOwner.get(String(r.so)); if (!oid) continue; const e = recs.get(oid)!; const arr = (e[r.type] ??= []); if (!arr.includes(String(r.id))) arr.push(String(r.id)); }
  }
  const nameToId = new Map(orders.map((o) => [o.name.replace('#', ''), o.id.replace(/^.*\//, '')]));
  const cmRows = await ns.suiteQL(`SELECT id, otherrefnum, externalid FROM transaction WHERE type = 'CustCred' AND trandate >= TO_DATE('2026-01-01','YYYY-MM-DD') AND (otherrefnum LIKE '#%' OR externalid LIKE 'SHOPCM-%')`);
  for (const r of cmRows) { const oid = nameToId.get(String(r.otherrefnum ?? '').replace('#', '')); if (!oid) continue; const e = recs.get(oid) ?? {}; const arr = (e.CustCred ??= []); if (!arr.includes(String(r.id))) arr.push(String(r.id)); recs.set(oid, e); }

  // 3. Payments by memo (NetScore convention), bulk
  const names = orders.map((o) => o.name.replace('#', ''));
  const payByMemo = new Map<string, any[]>();
  for (const ch of chunks(names, 200)) {
    const rows = await ns.suiteQL(`SELECT id, memo, foreigntotal FROM transaction WHERE type = 'CustPymt' AND memo IN (${ch.map((n) => `'${n}'`).join(',')})`);
    for (const r of rows) { (payByMemo.get(String(r.memo)) ?? payByMemo.set(String(r.memo), []).get(String(r.memo))!).push(r); }
  }
  // 4. Fallback: link lookup for invoiced orders with no memo payment
  let fallback = 0;
  const payIdsByOrder = new Map<string, string[]>();
  for (const o of orders) {
    const id = o.id.replace(/^.*\//, ''), n = o.name.replace('#', '');
    const e = recs.get(id);
    const ids = new Set<string>([...(e?.CustPymt ?? []), ...(payByMemo.get(n) ?? []).map((p) => String(p.id))]);
    if (ids.size === 0 && e?.CustInvc?.length) {
      fallback++;
      for (const inv of e.CustInvc) for (const a of await applying(ns, inv)) {
        if (/^payment/i.test(a.tranid)) ids.add(String(a.id));
        if (/credit memo/i.test(a.tranid) && !(e.CustCred ?? []).includes(String(a.id))) (e.CustCred ??= []).push(String(a.id));
      }
    }
    payIdsByOrder.set(id, [...ids]);
  }
  console.log(`link-lookup fallbacks: ${fallback}`);

  // 5. Bulk NS facts
  const allTx = new Set<string>();
  for (const e of recs.values()) for (const t of ['CustInvc', 'CustCred']) (e[t] ?? []).forEach((x) => allTx.add(x));
  for (const ids of payIdsByOrder.values()) ids.forEach((x) => allTx.add(x));
  const total = new Map<string, { total: number; tranid: string; type: string }>();
  for (const ch of chunks([...allTx].map(Number).filter(Boolean), 200)) {
    for (const r of await ns.suiteQL(`SELECT id, tranid, type, foreigntotal FROM transaction WHERE id IN (${ch.join(',')})`)) total.set(String(r.id), { total: c(r.foreigntotal), tranid: r.tranid, type: r.type });
  }
  const payLines = new Map<string, any[]>();
  const allPay = [...new Set([...payIdsByOrder.values()].flat())].map(Number).filter(Boolean);
  for (const ch of chunks(allPay, 150)) {
    const rows = await ns.suiteQL(`SELECT tl.transaction, tl.mainline, a.acctnumber, tal.debit, tal.credit, tl.cleared FROM transactionline tl JOIN transactionaccountingline tal ON tal.transaction = tl.transaction AND tal.transactionline = tl.id JOIN account a ON a.id = tal.account WHERE tl.transaction IN (${ch.join(',')})`);
    for (const r of rows) (payLines.get(String(r.transaction)) ?? payLines.set(String(r.transaction), []).get(String(r.transaction))!).push(r);
  }

  // 6. Verdicts
  const issues: string[] = []; const presentation: string[] = []; let ok = 0, tests = 0, unpaid = 0;
  const counts: Record<string, number> = {};
  for (const o of orders) {
    if (o.test) { tests++; continue; }
    if (!['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(o.displayFinancialStatus)) { unpaid++; continue; }
    const id = o.id.replace(/^.*\//, ''); const d = storeDate(o.createdAt);
    const ok_ = (t: any) => t.status === 'SUCCESS';
    const charged = o.transactions.filter((t: any) => ok_(t) && (t.kind === 'SALE' || t.kind === 'CAPTURE')).reduce((s: number, t: any) => s + c(t.amountSet.shopMoney.amount), 0);
    const refunded = o.transactions.filter((t: any) => ok_(t) && t.kind === 'REFUND').reduce((s: number, t: any) => s + c(t.amountSet.shopMoney.amount), 0);
    const gateway = o.transactions.find((t: any) => ok_(t) && (t.kind === 'SALE' || t.kind === 'CAPTURE'))?.gateway ?? '?';
    // Shop-remitted (channel-liable) tax never reaches the payout → expected cash = charged − that tax (#5627 rule).
    const channelTax = (o.taxLines ?? []).filter((t: any) => t.channelLiable).reduce((s: number, t: any) => s + c(t.priceSet.shopMoney.amount), 0);
    const e = recs.get(id) ?? {};
    const invs = (e.CustInvc ?? []).map((i) => total.get(i)).filter(Boolean) as any[];
    const label = `#${o.name.replace('#','')} · ${d} · ${gateway} · Shopify ${$(charged)}${refunded ? ` −${$(refunded)} refunded` : ''}`;
    const problems: string[] = []; let reconciledWrong = false;
    if (invs.length === 0) { issues.push(`${label} → **NOT IN NETSUITE** (no invoice)`); counts['missing'] = (counts['missing'] ?? 0) + 1; continue; }
    const invTotal = invs.reduce((s, i) => s + i.total, 0);
    const cms = [...new Set(e.CustCred ?? [])].map((i) => total.get(i)).filter(Boolean) as any[];
    const cmTotal = cms.reduce((s, i) => s + Math.abs(i.total), 0);
    let cash = 0, writeoff = 0; const cashCells: string[] = [];
    for (const pid of payIdsByOrder.get(id) ?? []) {
      const lines = payLines.get(pid) ?? []; const head = lines.find((l) => l.mainline === 'T');
      const amt = c(head?.debit); cash += amt;
      const cleared = head?.cleared === 'T';
      cashCells.push(`${total.get(pid)?.tranid ?? pid} ${$(amt)} → ${head?.acctnumber ?? '?'}${cleared ? ' (bank-matched)' : ''}`);
      for (const l of lines) if (l.mainline === 'F' && l.acctnumber && l.acctnumber !== '101101') writeoff += c(l.debit) - c(l.credit);
      if (cleared && Math.abs(amt - charged) > 0) reconciledWrong = true;
    }
    // Engine representation: payment = full charge, Shop-remitted tax moves to 240502 at payout.
    // NetScore/bookkeeper alternative (#5627): payment short by the tax, written off at payment — net-correct, accept it.
    const taxWriteoff = channelTax > 0 && Math.abs(writeoff - channelTax) < 0.005 ? writeoff : 0;
    const expectedCash = charged - taxWriteoff;
    const netTruth = charged - refunded, netBooked = invTotal - (writeoff - taxWriteoff) - cmTotal;
    const nettedByNetScore = refunded > 0 && cmTotal === 0 && invTotal === netTruth && cash === netTruth;
    if (nettedByNetScore) problems.push(`booked NET of the ${$(refunded)} refund (invoice and payment reduced; no credit memo, no customer refund) — net cash/revenue right, gross wrong`);
    else {
      if (Math.abs(cash - expectedCash) > 0.005) problems.push(`cash recorded ${$(cash)} vs Shopify charged ${$(charged)}${taxWriteoff ? ` less Shop-remitted tax ${$(taxWriteoff)} written off` : ''} (Δ ${$(cash - expectedCash)})`);
      if (refunded > 0 && cmTotal === 0) problems.push(`Shopify refund ${$(refunded)} has no credit memo`);
    }
    if (!nettedByNetScore && Math.abs(netBooked - netTruth) > 0.005) problems.push(`net revenue booked ${$(netBooked)} vs Shopify net ${$(netTruth)} (Δ ${$(netBooked - netTruth)})`);
    if (o.displayFulfillmentStatus === 'FULFILLED' && !(e.ItemShip ?? []).length) problems.push('shipped in Shopify, no item fulfillment in NS');
    if (problems.length) {
      counts['issues'] = (counts['issues'] ?? 0) + 1;
      issues.push(`${label}\n  NS: invoice ${invs.map((i) => `${i.tranid} ${$(i.total)}`).join(' + ')}${cmTotal ? `, CM ${$(cmTotal)}` : ''}; payments: ${cashCells.join('; ') || 'none found'}${writeoff ? `; write-offs ${$(writeoff)}` : ''}\n  WRONG: ${problems.join('; ')}\n  Bookkeeper: ${reconciledWrong ? '**bank-matched a wrong amount**' : cashCells.some((x) => x.includes('bank-matched')) ? 'bank-matched (amount correct)' : 'not bank-matched in NS'}`);
    } else if (invTotal !== charged && invTotal !== expectedCash) {
      presentation.push(`${label} — invoice ${$(invTotal)} with ${$(writeoff)} written off at payment (net correct)`);
      ok++;
    } else ok++;
  }
  const out = [`# 2026 — Shopify vs NetSuite, the clean list (${new Date().toISOString().slice(0,16)}Z)`, '',
    `Orders: ${orders.length} · test excluded: ${tests} · unpaid/cancelled (nothing to record): ${unpaid} · **properly recorded: ${ok}** · on the list below: ${issues.length}`, '',
    'Definition — properly recorded = NS invoice/fulfillment/credit memo exist as Shopify says, cash recorded == cash Shopify moved, net revenue == Shopify net. All 2026 periods are open.', '',
    `## THE LIST — ${issues.length} orders needing action`, '', ...issues.map((s) => `- ${s}`), '',
    `## Presentation only — ${presentation.length} orders (net correct; NetScore overstated the invoice and the bookkeeper wrote the difference off at payment). No action unless the CPA wants gross sales to match Shopify.`, '', ...presentation.map((s) => `- ${s}`), ''];
  const p = '/Users/gililisani/Documents/GitHub/qiqi-orders/docs/AUDIT-2026-CLEAN-LIST.md';
  // Keep the hand-written "## Progress" section (group outcomes) across regenerations.
  const prev = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const prog = prev.match(/## Progress[\s\S]*?(?=\n## THE LIST)/);
  if (prog) out.splice(6, 0, prog[0].trimEnd(), '');
  fs.writeFileSync(p, out.join('\n'));
  console.log(out.slice(0, 4).join('\n')); console.log(`issues=${issues.length} presentation=${presentation.length} → ${p}`);
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 500)); process.exit(1); });
