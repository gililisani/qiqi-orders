/**
 * Production NetSuite setup for the Shopify sync — build item 3 of the
 * migration plan (docs/SHOPIFY-SYNC.md). Mirrors the sandbox creation
 * scripts (create-refund-adjustment-item / create-shopify-rep /
 * fix-discount-item / owner-created tax items).
 *
 *   npx tsx scripts/shopify/setup-production.ts                     # VERIFY ONLY (read-only)
 *   npx tsx scripts/shopify/setup-production.ts --apply             # create the 4 inert records
 *   npx tsx scripts/shopify/setup-production.ts --repoint-discount  # AT CUTOVER ONLY (see below)
 *
 * Output ends with the PRODUCTION_ENGINE_CONFIG values to paste into
 * lib/shopify/engine/config.ts (replacing the PROD-PENDING sentinels).
 *
 * WHY --repoint-discount is separate: NetScore ACTIVELY books through
 * "Shopify Discount" (1056) — 527 lines, latest 2026-08-19. It is
 * non-posting today; pointing it at 420000 while NetScore still runs
 * would change how THEIR live discounts post mid-period. Run it in the
 * cutover sequence, right after their script deployments are inactive.
 * The other 4 records (2 tax items, refund adjustment, sales rep) are
 * inert additions NetScore never touches — safe to create any time.
 *
 * Facts baked in (probed prod 2026-08-20, read-only):
 * - Account ids are IDENTICAL to sandbox (Apr-2025 copy): 100501=1019,
 *   100503=1026, 100504=1021, 100101=938, 622070=1859, 240502=1573,
 *   240504=1571, 410000=833, 420000=466.
 * - Prod 240502/240504 still carry their OLD names (rename = owner action,
 *   CPA nod); 240502 has a CLOSED, net-zero franchise-tax accrual trio
 *   (VendBill 38777369 + JEUS12838/9/40, $556 in = $556 out) — safe.
 * - Prod "Shopify Discount" (1056) exists and is NON-POSTING (no income
 *   account) — the re-point to 420000 (466) is required.
 * - SuiteQL in prod cannot see term/employee/customercategory tables
 *   (role visibility) — terms verified via customer usage, employee via
 *   REST externalid, categories assumed (same pre-copy data as sandbox).
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

const APPLY = process.argv.includes('--apply');
const REPOINT_DISCOUNT = process.argv.includes('--repoint-discount');

/** number → expected internal id (identical in sandbox + prod, verified). */
const EXPECTED_ACCOUNTS: Record<string, string> = {
  '100501': '1019', // Shopify clearing (shopify_payments / shop_pay / shop_cash)
  '100503': '1026', // Affirm clearing
  '100504': '1021', // PayPal clearing
  '100101': '938', // IDB QIQINC (USD) — payout net journal bank leg
  '622070': '1859', // Shopify processing fee expense
  '240502': '1573', // Marketplace Tax — Shop Remitted (rename pending)
  '240504': '1571', // Duties & Taxes pass-through DDP (rename pending)
  '410000': '833', // Sales (refund adjustment income)
  '420000': '466', // Sales Discounts (discount item target)
};

const SANDBOX_NAMES: Record<string, string> = {
  '240502': 'Marketplace Tax - Shop Remitted',
  '240504': 'Duties & Taxes Collected - Pass-through (DDP)',
};

let failures = 0;
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const warn = (msg: string) => console.log(`  ⚠ ${msg}`);
const fail = (msg: string) => {
  failures += 1;
  console.log(`  ✗ ${msg}`);
};

async function main() {
  const ns = createNetSuiteForTarget('production');
  console.log(`setup-production: ${APPLY ? 'APPLY (will write to PROD NetSuite)' : 'verify-only (read-only)'}\n`);

  // ---- A. accounts ----
  console.log('accounts:');
  const accounts = await ns.suiteQL<{ id: string; acctnumber: string; accountsearchdisplayname: string }>(
    `SELECT id, acctnumber, accountsearchdisplayname FROM account WHERE acctnumber IN (${Object.keys(EXPECTED_ACCOUNTS)
      .map((n) => `'${n}'`)
      .join(',')})`,
  );
  for (const [num, expectedId] of Object.entries(EXPECTED_ACCOUNTS)) {
    const row = accounts.find((a) => a.acctnumber === num);
    if (!row) fail(`account ${num} not found in prod`);
    else if (String(row.id) !== expectedId) fail(`account ${num} has id ${row.id}, config expects ${expectedId}`);
    else ok(`${num} = id ${row.id} (${row.accountsearchdisplayname})`);
  }
  for (const num of ['240502', '240504']) {
    const row = accounts.find((a) => a.acctnumber === num);
    if (row && !row.accountsearchdisplayname.includes(SANDBOX_NAMES[num].slice(0, 12))) {
      warn(`${num} still carries its old name ("${row.accountsearchdisplayname}") — owner renames to "${SANDBOX_NAMES[num]}" (CPA nod)`);
    }
  }

  // ---- B. structural records ----
  console.log('structural records:');
  const loc = await ns.suiteQL<{ id: string; name: string; subsidiary: string; isinactive: string }>(
    `SELECT id, name, subsidiary, isinactive FROM location WHERE id = 46`,
  );
  if (loc[0]?.isinactive === 'F' && loc[0]?.subsidiary === '1') ok(`location 46 "${loc[0].name}" active under subsidiary 1 (BrandFox CSF target)`);
  else fail(`location 46 wrong/missing: ${JSON.stringify(loc[0] ?? null)}`);

  const vendor = await ns.suiteQL<{ id: string; isinactive: string; companyname?: string }>(
    `SELECT id, isinactive, companyname FROM vendor WHERE id = 69810`,
  );
  if (vendor[0]?.isinactive === 'F') ok(`vendor 69810 (Shopify Inc.) active`);
  else fail(`vendor 69810 missing/inactive`);

  const terms = await ns.suiteQL<{ n: string }>(`SELECT COUNT(*) AS n FROM customer WHERE terms = 8`);
  if (Number(terms[0]?.n) > 0) ok(`terms 8 in active use (${terms[0].n} customers)`);
  else fail('terms 8 appears unused — verify "Upfront on Sales order" id in prod');

  const ship = await ns.suiteQL<{ n: string }>(
    `SELECT COUNT(*) AS n FROM transactionline WHERE item = 1171 AND itemtype = 'ShipItem'`,
  );
  if (Number(ship[0]?.n) > 0) ok(`ship method 1171 in active use (${ship[0].n} transaction lines)`);
  else fail('ship item 1171 appears unused in prod');

  // ---- C. items ----
  console.log('items:');
  const taxDdpId = await ensureOtherChargeItem(ns, {
    externalId: 'SHOP-TAX-DDP',
    itemId: 'Intl Duties & Taxes (DDP)',
    incomeAccountId: EXPECTED_ACCOUNTS['240504'],
    label: 'DDP pass-through tax item',
  });
  const taxMktId = await ensureOtherChargeItem(ns, {
    externalId: 'SHOP-TAX-MKT',
    itemId: 'Marketplace Tax (Shop)',
    incomeAccountId: EXPECTED_ACCOUNTS['240502'],
    label: 'marketplace pass-through tax item',
  });
  const refundAdjId = await ensureOtherChargeItem(ns, {
    externalId: 'SHOP-REFUND-ADJ',
    itemId: 'Shopify Refund Adjustment',
    incomeAccountId: EXPECTED_ACCOUNTS['410000'],
    label: 'refund adjustment item',
  });

  // "Shopify Discount" (1056): pre-existing Discount item, non-posting in
  // prod — must point at 420000 (466) or discounts vanish from the P&L.
  // NetScore still books through it, so the re-point is a CUTOVER step
  // (--repoint-discount), never part of the regular --apply.
  let discountReady = false;
  const disc = await ns.suiteQL<{ id: string; itemid: string; incomeaccount: string | null }>(
    `SELECT id, itemid, incomeaccount FROM item WHERE id = 1056`,
  );
  if (!disc.length) fail('discount item 1056 not found in prod');
  else if (String(disc[0].incomeaccount ?? '') === EXPECTED_ACCOUNTS['420000']) {
    ok(`discount item 1056 posts to 420000`);
    discountReady = true;
  } else if (REPOINT_DISCOUNT) {
    await ns.updateRecord('discountItem', '1056', { account: { id: EXPECTED_ACCOUNTS['420000'] } });
    ok(`discount item 1056 re-pointed to 420000 (was ${disc[0].incomeaccount ?? 'NON-POSTING'})`);
    discountReady = true;
  } else {
    warn(
      `discount item 1056 is ${disc[0].incomeaccount ? `on account ${disc[0].incomeaccount}` : 'NON-POSTING'} — NetScore still uses it; run --repoint-discount AT CUTOVER (after their scripts stop)`,
    );
  }

  // ---- D. sales rep ----
  console.log('sales rep:');
  let repId = await ns.findRecordIdByExternalId('employee', 'SHOP-SALESREP');
  if (repId) ok(`"Shopify" sales rep exists (id ${repId})`);
  else if (APPLY) {
    repId = await ns.createRecord('employee', {
      externalId: 'SHOP-SALESREP',
      entityId: 'Shopify',
      firstName: 'Shopify',
      lastName: 'Channel',
      isSalesRep: true,
      subsidiary: { id: '3' },
    });
    ok(`created "Shopify" sales rep (id ${repId})`);
  } else {
    fail('"Shopify" sales rep missing — --apply creates it');
  }

  // ---- E. output ----
  console.log('');
  if (failures > 0 && !APPLY) {
    console.log(`${failures} item(s) need attention — re-run with --apply to create/fix the creatable ones.`);
  }
  if (taxDdpId && taxMktId && refundAdjId && repId && failures === 0) {
    console.log('ALL VERIFIED. Paste into PRODUCTION_ENGINE_CONFIG (lib/shopify/engine/config.ts):\n');
    console.log(`  taxItems: { merchantLiable: '${taxDdpId}', channelLiable: '${taxMktId}' },`);
    console.log(`  salesRepId: '${repId}',`);
    console.log(`  refundAdjustmentItemId: '${refundAdjId}',`);
    console.log('\nThen: remove the PROD-PENDING sentinels, run npm test, commit, deploy.');
    if (!discountReady) {
      console.log('\nREMINDER: discount item 1056 re-point is still pending — run --repoint-discount at cutover.');
    }
  } else {
    console.log('Config values incomplete — resolve the ✗ lines first.');
    process.exit(1);
  }
}

/** Ensure an invoice-only Other Charge for Sale item (mirrors sandbox shape). */
async function ensureOtherChargeItem(
  ns: ReturnType<typeof createNetSuiteForTarget>,
  spec: { externalId: string; itemId: string; incomeAccountId: string; label: string },
): Promise<string | null> {
  let id = await ns.findRecordIdByExternalId('otherChargeSaleItem', spec.externalId);
  if (!id) {
    // Owner-created sandbox originals carry no externalid — adopt a
    // same-name prod item if one exists before creating.
    const esc = spec.itemId.replace(/'/g, "''");
    const byName = await ns.suiteQL<{ id: string; incomeaccount: string | null }>(
      `SELECT id, incomeaccount FROM item WHERE LOWER(itemid) = '${esc.toLowerCase()}' AND itemtype = 'OthCharge'`,
    );
    if (byName.length) id = String(byName[0].id);
  }
  if (id) {
    const row = await ns.suiteQL<{ incomeaccount: string | null }>(
      `SELECT incomeaccount FROM item WHERE id = ${Number(id)}`,
    );
    if (String(row[0]?.incomeaccount ?? '') !== spec.incomeAccountId) {
      if (APPLY) {
        await ns.updateRecord('otherChargeSaleItem', id, { incomeAccount: { id: spec.incomeAccountId } });
        ok(`${spec.label} (${id}) re-pointed to account ${spec.incomeAccountId}`);
      } else {
        fail(`${spec.label} (${id}) on wrong account ${row[0]?.incomeaccount} — --apply re-points`);
      }
    } else {
      ok(`${spec.label} exists (id ${id}, account ${spec.incomeAccountId})`);
    }
    return id;
  }
  if (!APPLY) {
    fail(`${spec.label} missing — --apply creates "${spec.itemId}"`);
    return null;
  }
  // Mirror the sandbox creation exactly: sub 11 (Qiqi Group) + children so
  // both Qiqi Global and Qiqi INC can use it; zero base price so REST can
  // order it; invoice-only usage is enforced by the engine, not NS.
  id = await ns.createRecord('otherChargeSaleItem', {
    externalId: spec.externalId,
    itemId: spec.itemId,
    subsidiary: { items: [{ id: '11' }] },
    includeChildren: true,
    incomeAccount: { id: spec.incomeAccountId },
    taxSchedule: { id: '1' },
  });
  await ns.updateRecord('otherChargeSaleItem', id, {
    price: { items: [{ currencyPage: { id: '1' }, priceLevel: { id: '1' }, quantity: { value: 0 }, price: 0 }] },
  });
  ok(`created ${spec.label} "${spec.itemId}" (id ${id}) → account ${spec.incomeAccountId}`);
  return id;
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
