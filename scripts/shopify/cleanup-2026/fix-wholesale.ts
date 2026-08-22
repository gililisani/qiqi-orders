/**
 * Pro-Discount-era rule (b), generalised for ENGINE-created records
 * (ids from shopify_order_sync): product lines → NET wholesale (Shopify
 * original − discount allocations), header discount → 0. Invoice total
 * is unchanged by construction (gross − discount == net); the GL moves
 * the discount out of 420000. Dry-run by default; `--apply` writes.
 *   NODE_PATH=$PWD/node_modules SHOPIFY_ADMIN_TOKEN= npx tsx scripts/shopify/cleanup-2026/fix-wholesale.ts [--apply] 6545
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { shopifyGraphQL } from '../../../lib/shopify/client';
import { createNetSuiteForTarget } from '../../../lib/shopify/engine/nsTarget';

const APPLY = process.argv.includes('--apply');
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const r2 = (n: number) => Math.round(n * 100) / 100;
async function rest(ns: any, method: string, p: string, data?: any) {
  const url = `${ns.baseUrl}${p}`;
  const res = await axios({ method, url, headers: { Authorization: ns.getAuthHeader(url, method), Accept: 'application/json', 'Content-Type': 'application/json' }, data: data ? JSON.stringify(data) : undefined, validateStatus: () => true });
  if (res.status >= 400) throw new Error(`${method} ${p} → ${res.status} ${res.data?.['o:errorDetails']?.map((d: any) => d.detail).join(' | ') ?? ''}`);
  return res.data;
}
async function main() {
  const ns: any = createNetSuiteForTarget('production');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  console.log(APPLY ? '*** APPLY MODE — writing to PRODUCTION NetSuite ***' : '--- DRY RUN (no writes) ---');
  for (const name of names) {
    const d = await shopifyGraphQL(`{ orders(first: 1, query: "name:#${name}") { nodes { id lineItems(first: 30) { nodes { sku quantity originalTotalSet { shopMoney { amount } } discountAllocations { allocatedAmountSet { shopMoney { amount } } } } } } } }`);
    const o = d.orders.nodes[0]; const sid = o.id.replace(/^.*\//, '');
    const net = new Map<string, { total: number; qty: number; gross: number }>();
    for (const l of o.lineItems.nodes) { const gross = Number(l.originalTotalSet.shopMoney.amount); const disc = l.discountAllocations.reduce((a: number, x: any) => a + Number(x.allocatedAmountSet.shopMoney.amount), 0); const prev = net.get(l.sku); net.set(l.sku, { total: r2((prev?.total ?? 0) + gross - disc), qty: (prev?.qty ?? 0) + l.quantity, gross: r2((prev?.gross ?? 0) + gross) }); }
    const totalDisc = r2([...net.values()].reduce((s, v) => s + v.gross - v.total, 0));
    const { data: row } = await db.from('shopify_order_sync').select('ns_so_id, ns_invoice_id').eq('shopify_order_id', sid).single();
    if (!row?.ns_invoice_id) { console.log(`✗ #${name}: no engine row`); continue; }
    console.log(`\n#${name}: discount allocations $${totalDisc} → move out of 420000 into net line prices`);
    for (const [type, id] of [['invoice', row.ns_invoice_id], ['salesOrder', row.ns_so_id]] as const) {
      const hdr = await rest(ns, 'GET', `/record/v1/${type}/${id}?fields=total,discountRate,discountTotal`);
      const items = (await rest(ns, 'GET', `/record/v1/${type}/${id}/item?expandSubResources=true`)).items ?? [];
      const patch: any[] = [];
      for (const it of items) {
        const sku = String(it.item?.refName ?? '').split(' ')[0]; const w = net.get(sku); if (!w) continue;
        const lineNet = r2(w.total * (it.quantity / w.qty)); const rate = r2(lineNet / it.quantity);
        if (Math.abs(Number(it.amount) - lineNet) > 0.005) patch.push({ line: it.line, item: { id: it.item.id }, price: { id: '-1' }, rate, amount: lineNet, _was: `${sku} ×${it.quantity} $${it.amount} → $${lineNet}` });
      }
      console.log(`  ${type} ${id}: total $${hdr.total} discount ${hdr.discountRate ?? hdr.discountTotal ?? 0} · ${patch.length} lines: ${patch.map((p) => p._was).join(', ') || 'none'} · header discountRate → 0`);
      if (!APPLY) continue;
      const body: any = { discountRate: 0 }; if (patch.length) body.item = { items: patch.map(({ _was, ...r }) => r) };
      await rest(ns, 'PATCH', `/record/v1/${type}/${id}`, body);
      const after = await rest(ns, 'GET', `/record/v1/${type}/${id}?fields=total,discountTotal`);
      console.log(`  → ${type} total $${after.total} (was $${hdr.total}) discountTotal ${after.discountTotal ?? 0}`);
    }
    if (APPLY) {
      const gl = await ns.suiteQL(`SELECT a.acctnumber, tal.amount FROM transactionaccountingline tal JOIN account a ON a.id = tal.account WHERE tal.transaction = ${row.ns_invoice_id} AND tal.posting = 'T'`);
      const by = new Map<string, number>(); for (const g of gl) by.set(String(g.acctnumber), r2((by.get(String(g.acctnumber)) ?? 0) + Number(g.amount)));
      console.log(`✓ #${name} invoice GL: ${[...by.entries()].filter(([, v]) => v !== 0).map(([a, v]) => `${a} ${v}`).join(' · ')}`);
    }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
