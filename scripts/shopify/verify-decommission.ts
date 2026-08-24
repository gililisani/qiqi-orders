/** Post-bundle-uninstall verification (read-only): NetScore objects gone, our world intact. */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';
import { normalizeNsDate } from '../../lib/netsuite';

async function main() {
  const ns: any = createNetSuiteForTarget('production');
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  // 1. NetScore scripts left in NS
  const scripts = await ns.suiteQL(`SELECT id, name FROM script WHERE LOWER(scriptid) LIKE '%netscore%' OR LOWER(name) LIKE '%netscore%' OR LOWER(scriptid) LIKE '%shopify%'`);
  const ours = scripts.filter((s: any) => /QQ Shopify/i.test(s.name));
  const theirs = scripts.filter((s: any) => !/QQ Shopify/i.test(s.name));
  console.log(`1. NetScore scripts remaining in NS: ${theirs.length}${theirs.length ? ' → ' + theirs.map((s: any) => s.name).join(' · ') : ' ✓ (our FI plug-in untouched: ' + ours.length + ')'}`);

  // 2. Snapshot intact in Supabase
  const { count: txnStamps } = await db.from('netscore_transaction_stamps').select('*', { count: 'exact', head: true }).eq('ns_target', 'production');
  const { count: custStamps } = await db.from('netscore_customer_stamps').select('*', { count: 'exact', head: true }).eq('ns_target', 'production');
  console.log(`2. Supabase snapshot: ${txnStamps} transaction stamps · ${custStamps} customer stamps ${txnStamps! > 18000 && custStamps! > 2000 ? '✓' : '⚠ UNEXPECTED'}`);

  // 3. Spot-check: 3 stamped NetScore-era chains still exist in NS
  const { data: sample } = await db.from('netscore_transaction_stamps').select('ns_transaction_id, tran_id').eq('ns_target', 'production').eq('tran_type', 'CustInvc').limit(3);
  const ids = sample!.map((s) => s.ns_transaction_id).join(',');
  const found = await ns.suiteQL(`SELECT id, tranid, foreigntotal FROM transaction WHERE id IN (${ids})`);
  console.log(`3. NetScore-era records survive: ${found.length}/3 → ${found.map((r: any) => `${r.tranid} $${r.foreigntotal}`).join(' · ')} ${found.length === 3 ? '✓' : '⚠'}`);

  // 4. Our engine records + live sync health
  const recent = await ns.suiteQL(`SELECT COUNT(*) AS n FROM transaction WHERE externalid LIKE 'SHOPORD-%' AND trandate >= TO_DATE('2026-08-20','YYYY-MM-DD')`);
  console.log(`4. Engine sales orders since cutover: ${recent[0].n} ✓`);
  const { data: cfg } = await db.from('shopify_sync_config').select('key, value').in('key', ['mode', 'cursor', 'last_poll_at', 'last_poll_status']);
  console.log(`5. Sync config: ${(cfg ?? []).map((r) => `${r.key}=${String(JSON.stringify(r.value)).slice(0, 45)}`).join(' · ')}`);
  const { data: errs, count: errCount } = await db.from('shopify_order_sync').select('shopify_order_id', { count: 'exact' }).eq('state', 'error');
  console.log(`6. Error queue: ${errCount} ${errCount === 0 ? '✓' : '⚠ ' + JSON.stringify(errs?.slice(0, 3))}`);
  const { data: ev } = await db.from('shopify_sync_events').select('created_at, category, event').order('created_at', { ascending: false }).limit(3);
  console.log(`7. Latest sync events: ${(ev ?? []).map((e) => `${String(e.created_at).slice(5, 16)} ${e.category}/${e.event}`).join(' · ')}`);
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1); });
