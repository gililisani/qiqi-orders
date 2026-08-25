/**
 * Phase B runner — PayPal (100504) + Affirm (100503) fee/transfer booking.
 * Owner decisions 2026-08-24: next-event-onward handoff (bookkeeper's
 * existing journals are ADOPTED by amount±5d match, never re-booked),
 * PayPal fees monthly (622060), Affirm fees per engine deposit (710130).
 *
 * Dry-run by default — prints book vs adopt vs park. `--apply` writes
 * journals to PRODUCTION NetSuite (idempotent via the QQPP-/QQAF- external ids).
 *   NODE_PATH=$PWD/node_modules npx tsx scripts/shopify/gateway-booking.ts [--apply] [--from 2026-06-01]
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { bookGatewayEntries } from '../../lib/shopify/engine/gatewayRun';
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

const APPLY = process.argv.includes('--apply');

async function main() {
  console.log(APPLY ? '*** APPLY MODE — writing journals to PRODUCTION ***' : '--- DRY RUN (no writes) ---');
  const ns: any = createNetSuiteForTarget('production');
  const r = await bookGatewayEntries({ ns, apply: APPLY, log: (l) => console.log('  ' + l) });
  console.log(JSON.stringify(r, null, 1));
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 400)); process.exit(1); });
