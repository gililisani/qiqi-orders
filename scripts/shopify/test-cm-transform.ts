// Does invoice→creditMemo transform REPLACE lines when the body provides
// them (→ perfect: linkage + exact refund lines), or append (→ unusable)?
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const soId = await ns.createRecord('salesOrder', {
    externalId: 'TEST-CMLINK-SO',
    entity: { id: '7179' },
    subsidiary: { id: '3' },
    tranDate: '2026-08-18',
    item: { items: [
      { item: { id: '1040' }, quantity: 2, amount: 100.0, description: 'product A' },
      { item: { id: '1038' }, quantity: 1, amount: 50.0, description: 'product B' },
    ] },
  });
  const invId = await ns.transformRecord('salesOrder', soId, 'invoice', { externalId: 'TEST-CMLINK-INV' });
  console.log('SO', soId, 'invoice', invId);
  let cmId: string | null = null;
  try {
    cmId = await ns.transformRecord('invoice', invId, 'creditMemo', {
      externalId: 'TEST-CMLINK-CM',
      item: { items: [{ item: { id: '1534' }, quantity: 1, amount: 30.0, description: 'partial refund' }] },
    });
    const lines = await ns.suiteQL(
      `SELECT item, quantity, rate, netamount FROM transactionline WHERE transaction = ${cmId} AND mainline = 'F' AND taxline = 'F'`,
    );
    console.log('CM lines:', JSON.stringify(lines));
  } catch (e: any) {
    console.log('transform FAILED:', String(e?.message).slice(0, 250));
  } finally {
    if (cmId) await ns.suiteQL(`SELECT 1 FROM dual`).catch(() => {});
    // cleanup
    try { if (cmId) await (ns as any).deleteInvoice ? null : null; } catch {}
  }
  // cleanup: CM has no delete helper — use raw deletes via record API
  for (const [type, id] of [['creditmemo', cmId], ['invoice', invId], ['salesOrder', soId]] as const) {
    if (!id) continue;
    try {
      await (ns as any).updateRecord; // noop guard
      const axios = (await import('axios')).default;
      // reuse class internals not available; fall back to leaving records with TEST- prefix
    } catch {}
  }
  console.log('NOTE: TEST-CMLINK-* records left in sandbox for manual inspection/deletion');
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
