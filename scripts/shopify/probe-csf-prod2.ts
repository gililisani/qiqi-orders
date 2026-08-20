/**
 * Read-only PROD probe #2 — CM/invoice header locations + subsidiary tree.
 * Answers what location a prod credit memo (subsidiary 3) can legally
 * carry, from NetScore's own CustCred records. SuiteQL SELECTs only.
 *
 *   npx tsx scripts/shopify/probe-csf-prod2.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { createNetSuiteAPI } from '../../lib/netsuite';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const ns = createNetSuiteAPI();

  console.log('--- subsidiary tree (id, name, parent) ---');
  const subs = await ns.suiteQL<Record<string, unknown>>(
    `SELECT id, name, parent, isinactive FROM subsidiary ORDER BY id`,
  );
  for (const s of subs) console.log(JSON.stringify(s));

  console.log('--- location 46 detail (makeinventoryavailable / subsidiary edition) ---');
  const loc = await ns.suiteQL<Record<string, unknown>>(
    `SELECT * FROM location WHERE id = 46`,
  );
  for (const l of loc) console.log(JSON.stringify(l));

  console.log('--- recent NetScore CustCred headers (location?) ---');
  const cms = await ns.suiteQL<Record<string, unknown>>(
    `SELECT t.id, t.tranid, t.trandate, l.location, l.subsidiary
       FROM transaction t
       JOIN transactionline l ON l.transaction = t.id AND l.mainline = 'T'
      WHERE t.type = 'CustCred' AND t.custbody_shopify_order_id IS NOT NULL
      ORDER BY t.id DESC FETCH FIRST 6 ROWS ONLY`,
  );
  for (const r of cms) console.log(JSON.stringify(r));

  if (cms.length) {
    const ids = cms.map((c) => Number(c.id)).join(',');
    console.log('--- CustCred line locations/items ---');
    const lines = await ns.suiteQL<Record<string, unknown>>(
      `SELECT transaction, location, itemtype, item, quantity
         FROM transactionline WHERE transaction IN (${ids}) AND mainline = 'F'
        ORDER BY transaction`,
    );
    for (const r of lines) console.log(JSON.stringify(r));
  }

  console.log('--- recent NetScore CustInvc headers (location?) ---');
  const invs = await ns.suiteQL<Record<string, unknown>>(
    `SELECT t.id, t.tranid, l.location, l.subsidiary
       FROM transaction t
       JOIN transactionline l ON l.transaction = t.id AND l.mainline = 'T'
      WHERE t.type = 'CustInvc' AND t.custbody_shopify_order_id IS NOT NULL
      ORDER BY t.id DESC FETCH FIRST 4 ROWS ONLY`,
  );
  for (const r of invs) console.log(JSON.stringify(r));

  if (invs.length) {
    const ids = invs.map((c) => Number(c.id)).join(',');
    console.log('--- CustInvc line inventory locations ---');
    const lines = await ns.suiteQL<Record<string, unknown>>(
      `SELECT transaction, location, inventorylocation, inventorysubsidiary, itemtype
         FROM transactionline WHERE transaction IN (${ids}) AND mainline = 'F'
        ORDER BY transaction`,
    );
    for (const r of lines) console.log(JSON.stringify(r));
  }
}

main().catch((err) => {
  console.error('probe failed:', err?.message ?? err);
  process.exit(1);
});
