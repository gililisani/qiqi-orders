/**
 * Read-only survey of NetScore's footprint in production NetSuite:
 * which custom fields hold Shopify IDs, how many customers carry stamps,
 * what their transactions look like. Informs customer matching + the
 * stamp-migration job. SuiteQL SELECTs only — writes nothing.
 *
 *   npx tsx scripts/shopify/survey-netscore-ns.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { createNetSuiteAPI } from '../../lib/netsuite';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const ns = createNetSuiteAPI();

  // 1. Discover customer custom fields by pulling one row with SELECT *.
  //    (Column names of custentity fields appear in the result keys.)
  console.log('--- customer custom field discovery ---');
  try {
    const rows = await ns.suiteQL<Record<string, unknown>>(
      `SELECT * FROM customer WHERE ROWNUM <= 1`,
    );
    if (rows.length) {
      const keys = Object.keys(rows[0]);
      const custom = keys.filter((k) => k.startsWith('custentity'));
      console.log('custentity fields on customer:', JSON.stringify(custom));
      const shopifyish = keys.filter((k) => /shopif|netscore|ns_|ecom/i.test(k));
      console.log('shopify-ish keys:', JSON.stringify(shopifyish));
    }
  } catch (err: any) {
    console.log('SELECT * failed:', String(err?.message).slice(0, 300));
  }

  // 2. A customer we KNOW came from Shopify (today's B2B order, Pure Art
  //    Salon) — SuiteQL omits null columns, so the stamp fields only show
  //    on rows that actually carry values. Also demonstrates the dup problem.
  console.log('--- known Shopify customer (tara_renz@yahoo.com) ---');
  const dups = await ns.suiteQL<Record<string, unknown>>(
    `SELECT * FROM customer WHERE LOWER(email) = 'tara_renz@yahoo.com'`,
  );
  console.log('rows:', dups.length);
  const keys = new Set<string>();
  dups.forEach((r) => Object.keys(r).forEach((k) => k.startsWith('custentity') && keys.add(k)));
  console.log('custentity keys across rows:', JSON.stringify([...keys]));
  for (const r of dups.slice(0, 4)) {
    const pick = Object.fromEntries(
      Object.entries(r).filter(
        ([k]) =>
          k.startsWith('custentity') ||
          ['id', 'entityid', 'companyname', 'datecreated', 'externalid', 'isinactive', 'subsidiary'].includes(k),
      ),
    );
    console.log(JSON.stringify(pick));
  }

  // 3. Stamp coverage: how many customers carry the Shopify customer id.
  console.log('--- stamp coverage ---');
  const cov = await ns.suiteQL<Record<string, unknown>>(
    `SELECT COUNT(*) AS total,
            COUNT(custentity_shop_cust_id) AS stamped
       FROM customer`,
  );
  console.log(JSON.stringify(cov));

  // 4. Full NS record chain for known Shopify orders, keyed on
  //    NetScore's custbody_shopify_order_id.
  for (const [name, sid] of [
    ['#7201 (multi-tax, Apr-created store id)', '7516567535671'],
    ['#7246 (B2B today)', '7530826367031'],
  ] as const) {
    console.log(`--- chain for ${name} sid=${sid} ---`);
    const rows = await ns.suiteQL<Record<string, unknown>>(
      `SELECT id, tranid, type, trandate, entity, foreigntotal, status
         FROM transaction WHERE custbody_shopify_order_id = '${sid}'`,
    );
    console.log(rows.length ? JSON.stringify(rows) : '(none — not synced or different key)');
  }

  // 5. Sync coverage by type over the last 30 days.
  console.log('--- NetScore volume last 30d by type ---');
  const vol = await ns.suiteQL<Record<string, unknown>>(
    `SELECT type, COUNT(*) AS n
       FROM transaction
      WHERE custbody_shopify_order_id IS NOT NULL
        AND createddate >= SYSDATE - 30
      GROUP BY type`,
  );
  console.log(JSON.stringify(vol));
}

main().catch((err) => {
  console.error(String(err?.message ?? err));
  process.exit(1);
});
