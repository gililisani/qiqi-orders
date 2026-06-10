#!/usr/bin/env tsx
/**
 * Trusted points — CLI (used by the agent to ingest values read live from
 * NetSuite's Review Negative Inventory page via the owner's browser).
 *
 *   npm run inv:points -- list [ITEM]
 *   npm run inv:points -- add <ITEM> <DATE YYYY-MM-DD> <QTY> <LOCATION NAME...>
 *   npm run inv:points -- del <ITEM> [DATE]      # all of item's, or one date's
 *
 * Run with: npx tsx --env-file=.env.local scripts/inventoryTrustedPoints.ts …
 * (env must load before module eval — platform/auth throws otherwise)
 */
import {
  readTrustedPoints,
  readAllTrustedPoints,
  upsertTrustedPoints,
  deleteTrustedPointsForItem,
} from '../lib/inventory/trustedPoints';
import { createServiceRoleClient } from '../platform/auth/guards';

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === 'list') {
    const item = args[0];
    const points = item ? await readTrustedPoints(item) : [...(await readAllTrustedPoints()).values()].flat();
    if (!points.length) return console.log('(no trusted points)');
    for (const p of points) {
      console.log(`${p.itemCode.padEnd(10)} ${p.asOfDate}  ${String(p.qty).padStart(8)}  ${p.locationName}  [${p.source}] ${p.id}`);
    }
    return;
  }

  if (cmd === 'add') {
    const [item, date, qty, ...locParts] = args;
    const locationName = locParts.join(' ');
    if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || !Number.isFinite(Number(qty)) || !locationName) {
      throw new Error('usage: add <ITEM> <YYYY-MM-DD> <QTY> <LOCATION NAME...>');
    }
    await upsertTrustedPoints([{ itemCode: item, locationName, asOfDate: date, qty: Number(qty) }]);
    console.log(`saved: ${item.toUpperCase()} @ ${locationName} = ${qty} on ${date}`);
    return;
  }

  if (cmd === 'del') {
    const [item, date] = args;
    if (!item) throw new Error('usage: del <ITEM> [DATE]');
    if (date) {
      const sb = createServiceRoleClient();
      const { error } = await sb
        .from('inv_inv_trusted_points')
        .delete()
        .eq('item_code', item.toUpperCase())
        .eq('as_of_date', date);
      if (error) throw new Error(error.message);
      console.log(`deleted points for ${item.toUpperCase()} on ${date}`);
    } else {
      await deleteTrustedPointsForItem(item);
      console.log(`deleted all points for ${item.toUpperCase()}`);
    }
    return;
  }

  throw new Error('usage: list [ITEM] | add <ITEM> <DATE> <QTY> <LOCATION...> | del <ITEM> [DATE]');
}

main().catch((e) => {
  console.error('FAILED:', e?.message ?? e);
  process.exit(1);
});
