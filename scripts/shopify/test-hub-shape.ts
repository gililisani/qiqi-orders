// Replicate the HUB's proven SO payload shape in sandbox with a non-inventory item.
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const disc = await ns.suiteQL<{ id: string; itemtype: string }>(
    `SELECT id, itemtype FROM item WHERE LOWER(itemid) = 'partners support funds'`,
  );
  console.log('support funds item:', JSON.stringify(disc));
  const locs = await ns.suiteQL<{ id: string; name: string }>(
    `SELECT id, name, subsidiary FROM location WHERE isinactive = 'F' AND subsidiary = '3'`,
  );
  console.log('locations:', JSON.stringify(locs).slice(0, 300));

  const variants: Array<[string, Record<string, unknown>]> = [
    ['no-loc+1433+orderstatus', {
      externalId: 'TEST-HUBSHAPE-1',
      entity: { id: '7179' },
      subsidiary: { id: '3' },
      tranDate: '2026-08-18',
      orderstatus: { id: 'B' },
      currency: { id: '1' },
      item: { items: [{ item: { id: '1433' }, quantity: 1, rate: 1.0 }] },
    }],
    ['hub-shape+1433', {
      externalId: 'TEST-HUBSHAPE-2',
      entity: { id: '7179' },
      subsidiary: { id: '3' },
      tranDate: '2026-08-18',
      orderstatus: { id: 'B' },
      currency: { id: '1' },
      location: { id: locs[0]?.id },
      item: { items: [{ item: { id: '1433' }, quantity: 1, rate: 1.0 }] },
    }],
  ];
  for (const [label, payload] of variants) {
    try {
      const soId = await ns.createRecord('salesOrder', payload);
      console.log(`${label}: WORKS (${soId}) — deleting`);
      await ns.deleteSalesOrder(soId);
    } catch (e: any) {
      console.log(`${label}: FAILED — ${String(e?.message).slice(0, 200)}`);
    }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
