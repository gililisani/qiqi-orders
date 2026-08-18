// Sandbox isolation test: is item 1433 usable on ANY sub-3 SO?
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const fps = await ns.resolveItemIdsBySku(['FPS0025']);
  const fpsId = fps.get('FPS0025')!;
  console.log('control item FPS0025 id:', fpsId);
  const variants: Array<[string, Record<string, unknown>]> = [
    ['control-fps', { item: { id: fpsId }, quantity: 1, amount: 1.0, description: 'test' }],
    ['mixed-fps-plus-1433', { item: { id: '1433' }, quantity: 1, amount: 1.0, description: 'test' }],
  ];
  for (const [label, line] of variants) {
    try {
      const soId = await ns.createRecord('salesOrder', {
        externalId: `TEST-TAXITEM-${label}`,
        entity: { id: '7179' },
        subsidiary: { id: '3' },
        tranDate: '2026-08-18',
        memo: `tax item test ${label}`,
        item: { items: label === 'mixed-fps-plus-1433' ? [{ item: { id: fpsId }, quantity: 1, amount: 1.0 }, line] : [line] },
      });
      console.log(`${label}: SO created ${soId} — deleting`);
      await ns.deleteSalesOrder(soId);
    } catch (e: any) {
      console.log(`${label}: FAILED — ${String(e?.message).slice(0, 200)}`);
    }
  }
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
