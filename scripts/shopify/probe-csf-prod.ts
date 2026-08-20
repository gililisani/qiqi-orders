/**
 * Read-only PROD probe for Cross-Subsidiary Fulfillment (CSF) — the hard
 * gate of the production migration (docs/SHOPIFY-SYNC.md "Build remaining"
 * item 1). Answers, from NetScore's own live records:
 *
 *   1. What location do their recent Shopify SOs carry (header + lines)?
 *   2. What location do the matching Item Fulfillments ship from?
 *   3. What is the prod internal id of BrandFox, and which subsidiary owns it?
 *   4. Do their SO lines carry a separate inventory-location field (CSF)
 *      or a plain location?
 *
 * SuiteQL SELECTs only — writes nothing.
 *
 *   npx tsx scripts/shopify/probe-csf-prod.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { createNetSuiteAPI } from '../../lib/netsuite';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function main() {
  const ns = createNetSuiteAPI(); // NETSUITE_* = production

  console.log('--- 1. locations (id, name, subsidiary) ---');
  const locs = await ns.suiteQL<Record<string, unknown>>(
    `SELECT id, name, subsidiary, isinactive FROM location ORDER BY id`,
  );
  for (const l of locs) console.log(JSON.stringify(l));

  console.log('--- 2. subsidiaries ---');
  const subs = await ns.suiteQL<Record<string, unknown>>(
    `SELECT id, name, isinactive FROM subsidiary ORDER BY id`,
  );
  for (const s of subs) console.log(JSON.stringify(s));

  console.log('--- 3. recent NetScore SOs (header) ---');
  const sos = await ns.suiteQL<Record<string, unknown>>(
    `SELECT id, tranid, trandate, entity, custbody_shopify_order_id
       FROM transaction
      WHERE type = 'SalesOrd' AND custbody_shopify_order_id IS NOT NULL
      ORDER BY id DESC FETCH FIRST 5 ROWS ONLY`,
  );
  for (const so of sos) console.log(JSON.stringify(so));

  if (sos.length) {
    const soId = Number(sos[0].id);
    console.log(`--- 4. ALL columns of one SO line (SO ${sos[0].tranid}) — field discovery ---`);
    const lines = await ns.suiteQL<Record<string, unknown>>(
      `SELECT * FROM transactionline WHERE transaction = ${soId} AND mainline = 'F' AND ROWNUM <= 2`,
    );
    for (const r of lines) {
      const interesting = Object.fromEntries(
        Object.entries(r).filter(
          ([k]) => /location|subsidiary|item|quantity|mainline/i.test(k) && r[k] !== null,
        ),
      );
      console.log(JSON.stringify(interesting));
      console.log('all keys:', JSON.stringify(Object.keys(r)));
    }

    console.log('--- 5. line locations across the 5 SOs ---');
    const ids = sos.map((s) => Number(s.id)).join(',');
    const lineLocs = await ns.suiteQL<Record<string, unknown>>(
      `SELECT transaction, mainline, location, itemtype, COUNT(*) AS n
         FROM transactionline WHERE transaction IN (${ids})
        GROUP BY transaction, mainline, location, itemtype
        ORDER BY transaction, mainline`,
    );
    for (const r of lineLocs) console.log(JSON.stringify(r));

    console.log('--- 6. matching Item Fulfillments (same shopify order ids) ---');
    const shopIds = sos.map((s) => Number(s.custbody_shopify_order_id)).join(',');
    const ifs = await ns.suiteQL<Record<string, unknown>>(
      `SELECT id, tranid, trandate, custbody_shopify_order_id
         FROM transaction
        WHERE type = 'ItemShip' AND custbody_shopify_order_id IN (${shopIds})
        ORDER BY id DESC`,
    );
    for (const r of ifs) console.log(JSON.stringify(r));
    if (ifs.length) {
      const ifIds = ifs.map((r) => Number(r.id)).join(',');
      const ifLocs = await ns.suiteQL<Record<string, unknown>>(
        `SELECT transaction, location, COUNT(*) AS n
           FROM transactionline WHERE transaction IN (${ifIds}) AND mainline = 'F'
          GROUP BY transaction, location`,
      );
      for (const r of ifLocs) console.log(JSON.stringify(r));
    }

    console.log('--- 7. SO header location + subsidiary (transaction table) ---');
    const heads = await ns.suiteQL<Record<string, unknown>>(
      `SELECT t.id, t.tranid, l.location, l.subsidiary
         FROM transaction t
         JOIN transactionline l ON l.transaction = t.id AND l.mainline = 'T'
        WHERE t.id IN (${ids})`,
    );
    for (const r of heads) console.log(JSON.stringify(r));
  }
}

main().catch((err) => {
  console.error('probe failed:', err?.message ?? err);
  process.exit(1);
});
