// Verify an order's current NS chain by externalid: totals, lines, GL.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const sid = process.argv[2];
  const ns = createNetSuiteForTarget('sandbox');
  for (const [label, type, ext] of [
    ['SO', 'salesOrder', `SHOPORD-${sid}`],
    ['INV', 'invoice', `SHOPINV-${sid}`],
  ] as const) {
    const id = await ns.findRecordIdByExternalId(type, ext);
    if (!id) { console.log(`${label}: not found`); continue; }
    const total = await ns.suiteQL(`SELECT foreigntotal FROM transaction WHERE id = ${id}`);
    const gl = await ns.suiteQL(
      `SELECT a.acctnumber, a.accountsearchdisplayname, tal.debit, tal.credit
         FROM transactionaccountingline tal JOIN account a ON a.id = tal.account
        WHERE tal.transaction = ${id} AND (tal.debit IS NOT NULL OR tal.credit IS NOT NULL)`,
    );
    console.log(`${label} ${id} total:`, JSON.stringify(total), '\n  GL:', JSON.stringify(gl));
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
