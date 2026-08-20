/**
 * Snapshot ALL NetScore field data into Supabase before their bundle is
 * uninstalled. Read-only against NS; idempotent upserts.
 *
 *   npx tsx scripts/shopify/snapshot-netscore-data.ts --target sandbox|production [--db prod]
 *
 * DB defaults to the STAGING Supabase; pass --db prod to write the prod
 * HUB Supabase (the store the live poller reads). CUTOVER: re-run with
 * `--target production --db prod` immediately after NetScore's scripts
 * are deactivated, so last-minute orders carry stamps too.
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createClient } from '@supabase/supabase-js';
import { createNetSuiteForTarget, type NsTarget } from '../../lib/shopify/engine/nsTarget';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const target = (arg('target') ?? 'sandbox') as NsTarget;
  const ns = createNetSuiteForTarget(target);
  const db =
    arg('db') === 'prod'
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false },
        })
      : createClient(process.env.STAGING_SUPABASE_URL!, process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY!, {
          auth: { persistSession: false },
        });
  console.log(`snapshot: NS ${target} → ${arg('db') === 'prod' ? 'PROD' : 'staging'} Supabase`);
  const chunkUpsert = async (table: string, rows: any[]) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict: table === 'netscore_customer_stamps' ? 'ns_target,ns_customer_id' : table === 'netscore_transaction_stamps' ? 'ns_target,ns_transaction_id' : 'ns_target,ns_item_id' });
      if (error) throw new Error(`${table} upsert: ${error.message}`);
    }
  };

  const customers = await ns.suiteQLPaged<any>(
    `SELECT id, entityid, companyname, email, isinactive, custentity_shop_cust_id
       FROM customer WHERE custentity_shop_cust_id IS NOT NULL ORDER BY id`,
  );
  await chunkUpsert('netscore_customer_stamps', customers.map((c) => ({
    ns_customer_id: String(c.id),
    shopify_customer_id: String(c.custentity_shop_cust_id),
    entity_id: c.entityid ?? null,
    company_name: c.companyname ?? null,
    email: c.email ? String(c.email).toLowerCase() : null,
    is_inactive: c.isinactive === 'T',
    ns_target: target,
    snapshotted_at: new Date().toISOString(),
  })));
  console.log(`customers: ${customers.length}`);

  const txns = await ns.suiteQLPaged<any>(
    `SELECT id, type, tranid, custbody_shopify_order_id
       FROM transaction WHERE custbody_shopify_order_id IS NOT NULL ORDER BY id`,
  );
  await chunkUpsert('netscore_transaction_stamps', txns.map((t) => ({
    ns_transaction_id: String(t.id),
    shopify_order_id: String(t.custbody_shopify_order_id),
    tran_type: t.type ?? null,
    tran_id: t.tranid ?? null,
    ns_target: target,
    snapshotted_at: new Date().toISOString(),
  })));
  console.log(`transactions: ${txns.length}`);

  const items = await ns.suiteQLPaged<any>(
    `SELECT id, itemid, custitem_shopify_product_id, custitem_shopify_variant_id
       FROM item WHERE custitem_shopify_product_id IS NOT NULL OR custitem_shopify_variant_id IS NOT NULL ORDER BY id`,
  );
  await chunkUpsert('netscore_item_stamps', items.map((i) => ({
    ns_item_id: String(i.id),
    item_code: i.itemid ?? null,
    shopify_product_id: i.custitem_shopify_product_id ? String(i.custitem_shopify_product_id) : null,
    shopify_variant_id: i.custitem_shopify_variant_id ? String(i.custitem_shopify_variant_id) : null,
    ns_target: target,
    snapshotted_at: new Date().toISOString(),
  })));
  console.log(`items: ${items.length}`);
  console.log(`SNAPSHOT COMPLETE (${target})`);
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
