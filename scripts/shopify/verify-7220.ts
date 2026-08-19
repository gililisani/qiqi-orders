import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  for (const [label, id] of [['SO 425115', 425115], ['INV 425116', 425116]] as const) {
    const total = await ns.suiteQL(`SELECT foreigntotal FROM transaction WHERE id = ${id}`);
    const lines = await ns.suiteQL(
      `SELECT item, quantity, rate, netamount, itemtype FROM transactionline WHERE transaction = ${id} AND mainline = 'F' AND taxline = 'F' ORDER BY id`,
    );
    console.log(label, 'total:', JSON.stringify(total), 'lines:', JSON.stringify(lines));
    const gl = await ns.suiteQL(
      `SELECT tal.account, a.acctnumber, a.accountsearchdisplayname, tal.debit, tal.credit
         FROM transactionaccountingline tal
         JOIN account a ON a.id = tal.account
        WHERE tal.transaction = ${id} AND (tal.debit IS NOT NULL OR tal.credit IS NOT NULL)`,
    );
    console.log(label, 'GL:', JSON.stringify(gl));
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
