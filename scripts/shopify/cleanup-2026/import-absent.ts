/**
 * Group D — orders with NO NetSuite chain at all (NetScore lost them).
 * Imports them through the live engine's own entry (retryOrder = the
 * dashboard's "Import order #" cure): customer → SO → invoice → payment
 * → IF (if Shopify shipped) → CM on 1565 + Customer Refund, original
 * dates, idempotent by externalid.
 *
 * Extras the engine does not do:
 *   - cancelled orders: close the SO lines afterwards (no fulfillment
 *     backlog for goods that never shipped).
 *   - `--money-only-refund`: owner confirmed the returned goods did NOT
 *     come back → book the refund on 1565 with the engine's own
 *     ensureRefunds, restock guard off (engine parks those for v2), then
 *     re-run retryOrder so the row flips to 'refunded'.
 *
 * Dry-run by default — prints gate + plan. `--apply` writes to PRODUCTION.
 *   NODE_PATH=$PWD/node_modules SHOPIFY_ADMIN_TOKEN= npx tsx scripts/shopify/cleanup-2026/import-absent.ts [--apply] [--money-only-refund] 5683 6638 6642
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';
import { ShopifySyncStore } from '../../../lib/shopify/store';
import { fetchOrderByName, retryOrder } from '../../../lib/shopify/engine/retryOrder';
import { gateOrder } from '../../../lib/shopify/core/validate';
import { buildOrderPlan } from '../../../lib/shopify/core/orderTransform';
import { buildRefundPlans } from '../../../lib/shopify/core/refundTransform';
import { ensureRefunds } from '../../../lib/shopify/engine/refund';
import { engineConfigForTarget } from '../../../lib/shopify/engine/config';
import { loadKnownSkus } from '../../../lib/shopify/engine/deps';
import { createNetSuiteForTarget } from '../../../lib/shopify/engine/nsTarget';
import { normalizeNsDate } from '../../../lib/netsuite';

const APPLY = process.argv.includes('--apply');
const MONEY_ONLY = process.argv.includes('--money-only-refund');
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const r2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const store = new ShopifySyncStore(db);
  const cfg = await store.getConfig();
  if (cfg.mode !== 'live') throw new Error(`prod sync mode is '${cfg.mode}', expected live`);
  const config = engineConfigForTarget('production');
  const ns: any = createNetSuiteForTarget('production');
  const knownSkus = await loadKnownSkus();
  for (const sku of (await store.getSkuAliases()).keys()) knownSkus.add(sku);
  console.log(APPLY ? '*** APPLY MODE — writing to PRODUCTION NetSuite via the live engine ***' : '--- DRY RUN (no writes) ---');

  for (const name of names) {
    try {
      const order = await fetchOrderByName(name);
      if (!order) { console.log(`✗ #${name}: not in Shopify`); continue; }
      const sid = order.id.replace(/^.*\//, '');
      const gate = gateOrder(order, knownSkus);
      const { data: row } = await db.from('shopify_order_sync').select('state, error_code, error_message, ns_so_id, ns_invoice_id, ns_customer_id').eq('shopify_order_id', sid).maybeSingle();
      console.log(`\n#${name} (gid ${sid}) · ${order.createdAt} · ${order.displayFinancialStatus}/${order.displayFulfillmentStatus}${order.cancelledAt ? ` · CANCELLED ${order.cancelledAt}` : ''} · gate ${gate.outcome}${gate.outcome !== 'proceed' ? ` (${(gate as any).reason ?? (gate as any).issues?.map((i: any) => i.code).join(',')})` : ''} · sync row: ${row ? `${row.state}${row.error_code ? ` ${row.error_code}` : ''}` : 'none'}`);
      if (await store.hasNetscoreSalesOrder(sid)) { console.log(`  NetScore chain exists — not an absent order; skipping`); continue; }
      if (gate.outcome !== 'proceed') continue;
      const plan = buildOrderPlan(order);
      const { plans: refundPlans, issues } = buildRefundPlans(order);
      const asSold = plan.lines.reduce((s, l) => s + l.netAmountCents, 0) + (plan.shipping?.amountCents ?? 0) + plan.taxLines.reduce((s, t) => s + t.amountCents, 0);
      console.log(`  invoice as-sold: lines $${plan.lines.reduce((s, l) => s + l.netAmountCents, 0) / 100} [${plan.lines.map((l) => `${l.sku}×${l.quantity} $${l.netAmountCents / 100}`).join(', ')}] + shipping $${(plan.shipping?.amountCents ?? 0) / 100} + tax $${plan.taxLines.reduce((s, t) => s + t.amountCents, 0) / 100} [${plan.taxLines.map((t) => `${t.title}${t.channelLiable ? ' (channel)' : ''}`).join(', ')}] = $${asSold / 100}${plan.fxAdjustmentCents ? ` + FX rounding $${plan.fxAdjustmentCents / 100} = $${(asSold + plan.fxAdjustmentCents) / 100}` : ''}`);
      for (const r of refundPlans) console.log(`  refund ${r.shopifyRefundId} ${r.createdAt}: $${r.totalCents / 100} = lines [${r.lines.map((l) => `${l.sku}×${l.quantity} $${l.subtotalCents / 100} tax $${l.taxCents / 100}${l.restock ? ' restock' : ''}`).join(', ')}] + residual $${r.residualCents / 100} · txns ${r.transactions.map((t) => `${t.gateway} $${t.amountCents / 100}`).join(', ')}`);
      console.log(`  plan: buyer ${plan.buyer.kind}:${plan.buyer.displayName} · payments ${plan.payments.map((p) => `${p.gateway} $${p.amountCents / 100}`).join(', ')} · fulfillments ${order.fulfillments?.length ?? 0} · refunds ${refundPlans.map((r) => `$${r.totalCents / 100} (${r.lines.length} lines${r.lines.some((l) => l.restock) ? ', restock' : ''}, residual $${r.residualCents / 100})`).join(', ') || 'none'}${issues.length ? ` · refund issues ${issues.map((i) => i.code).join(',')}` : ''}`);
      if (!APPLY) continue;

      // 1. engine import (idempotent)
      let res = await retryOrder(order, store);
      console.log(`  engine: ${JSON.stringify(res)}`);
      // 2. money-only refund when the engine parked a restock refund (owner: goods did not come back)
      if (res.result === 'still_error' && MONEY_ONLY && res.issues.some((i) => /restock/i.test(i.message))) {
        const [so] = await ns.suiteQL(`SELECT id, entity FROM transaction WHERE externalid = '${config.externalIds.salesOrder(sid)}'`);
        if (!so) throw new Error('SO not found by externalid after import');
        const c = await ensureRefunds(refundPlans, plan, String(so.entity), ns, config, { orderHasNsFulfillment: false });
        console.log(`  money-only refund booked: CMs ${c.nsCreditMemoIds.join(',')} (${c.created.creditMemos} new) · refunds ${c.nsRefundIds.join(',')} (${c.created.refunds} new)`);
        res = await retryOrder(order, store);
        console.log(`  engine (re-run): ${JSON.stringify(res)}`);
      }
      if (res.result !== 'ok') continue;
      // 3. cancelled + never shipped → close SO lines
      const { data: after } = await db.from('shopify_order_sync').select('ns_so_id, ns_invoice_id, ns_payment_ids, ns_fulfillment_ids, ns_credit_memo_ids').eq('shopify_order_id', sid).single();
      if (order.cancelledAt && !(after!.ns_fulfillment_ids ?? []).length) {
        const lines = await ns.suiteQL(`SELECT id, item, itemtype, isclosed FROM transactionline WHERE transaction = ${after!.ns_so_id} AND mainline = 'F' AND taxline = 'F' AND itemtype IN ('Assembly','InvtPart')`);
        const open = lines.filter((l: any) => l.isclosed !== 'T');
        if (open.length) { await ns.updateRecord('salesOrder', String(after!.ns_so_id), { item: { items: open.map((l: any) => ({ line: Number(l.id), isClosed: true })) } }); console.log(`  closed ${open.length} SO lines (order cancelled, never shipped)`); }
      }
      // 4. read-back
      const ids = [after!.ns_so_id, after!.ns_invoice_id, ...(after!.ns_payment_ids ?? []), ...(after!.ns_fulfillment_ids ?? []), ...(after!.ns_credit_memo_ids ?? [])].filter(Boolean);
      const rf = await ns.suiteQL(`SELECT id FROM transaction WHERE type = 'CustRfnd' AND externalid LIKE 'SHOPRFD-%' AND entity = (SELECT entity FROM transaction WHERE id = ${after!.ns_so_id}) AND trandate >= TO_DATE('${normalizeNsDate(order.createdAt.slice(0, 10))}', 'YYYY-MM-DD')`);
      for (const r of rf) ids.push(String(r.id));
      const chk = await ns.suiteQL(`SELECT id, tranid, type, trandate, foreigntotal, status FROM transaction WHERE id IN (${ids.join(',')}) ORDER BY id`);
      const gl = await ns.suiteQL(`SELECT a.acctnumber, tal.amount FROM transactionaccountingline tal JOIN account a ON a.id = tal.account WHERE tal.transaction IN (${ids.join(',')}) AND tal.posting = 'T'`);
      const by = new Map<string, number>(); for (const g of gl) by.set(String(g.acctnumber), r2((by.get(String(g.acctnumber)) ?? 0) + Number(g.amount)));
      const charged = plan.payments.reduce((s, p) => s + p.amountCents, 0) / 100, refunded = refundPlans.reduce((s, r) => s + r.totalCents, 0) / 100;
      console.log(`✓ #${name}: ${chk.map((r: any) => `${r.type} ${r.tranid ?? ''} ${normalizeNsDate(r.trandate)} $${r.foreigntotal ?? ''} [${r.status}]`).join(' · ')}`);
      console.log(`  GL: ${[...by.entries()].filter(([, v]) => v !== 0).map(([a, v]) => `${a} ${v}`).join(' · ')} · Shopify charged $${charged} refunded $${refunded} net $${r2(charged - refunded)}`);
    } catch (e: any) { console.log(`✗ #${name}: ${String(e?.message ?? e).slice(0, 300)}`); }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
