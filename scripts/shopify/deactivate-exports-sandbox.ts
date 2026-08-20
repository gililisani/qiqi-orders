// SANDBOX: deactivate NetScore's NS→Shopify EXPORT deployments (owner-
// confirmed dead). Import-direction + license scripts left untouched.
//   npx tsx scripts/shopify/deactivate-exports-sandbox.ts [--probe|--test|--all|--revert]
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import { createNetSuiteForTarget } from '../../lib/shopify/engine/nsTarget';

// Export-direction scripts safe to kill now (by scriptid).
const EXPORT_SCRIPT_IDS = [
  'customscript_item_export_to_shopify',
  'customscript_inv_exp_to_shopify_from_ns',
  'customscript_price_exp_to_shopify',
  'customscript_image_exp_to_shopify',
  'customscript_netscore_child_item_export',
  'customscript_shopify_child_price_export',
  'customscript_shopify_child_images_export',
  'customscript_shopify_matrix_item_export',
  'customscript_shopify_kititem_export',
  'customscript_kititem_export_shopify',
  'customscript_shopify_products_available',
  'customscript_shopify_products_unavailabl',
  'customscript_shopify_product_update',
  'customscript_sho_itemids_update',
  'customscript_shipment_export_to_shopify',
  'customscript_netscore_order_cancellation',
];

async function main() {
  const ns = createNetSuiteForTarget('sandbox');
  const mode = process.argv[2] ?? '--probe';

  const list = EXPORT_SCRIPT_IDS.map((s) => `'${s}'`).join(',');
  const deployments = await ns.suiteQLPaged<Record<string, any>>(
    `SELECT d.primarykey, d.scriptid AS depscriptid, d.isdeployed, s.scriptid, s.name
       FROM scriptdeployment d JOIN script s ON s.id = d.script
      WHERE s.scriptid IN (${list})`,
  ).catch(async () => {
    // primarykey column may not exist — discover columns from one row
    const one = await ns.suiteQL(`SELECT * FROM scriptdeployment WHERE ROWNUM <= 1`);
    console.log('scriptdeployment columns:', Object.keys(one[0] ?? {}));
    return [];
  });
  if (!deployments.length) return;
  console.log(`${deployments.length} export deployments found in sandbox:`);
  for (const d of deployments) console.log(` `, JSON.stringify({ ...d, links: undefined }));

  if (mode === '--probe') return;

  const targets = mode === '--test' ? deployments.slice(0, 1) : deployments;
  for (const d of targets) {
    const id = d.primarykey;
    try {
      await ns.updateRecord('scriptdeployment', String(id), { isDeployed: mode === '--revert' });
      console.log(`  ${mode === '--revert' ? 'REACTIVATED' : 'DEACTIVATED'} ${d.name} (${d.depscriptid}, id ${id})`);
    } catch (e: any) {
      console.log(`  FAILED ${d.depscriptid} (id ${id}): ${String(e?.message).slice(0, 160)}`);
    }
  }
  // verify
  const after = await ns.suiteQLPaged(
    `SELECT d.primarykey, d.isdeployed, s.scriptid FROM scriptdeployment d JOIN script s ON s.id = d.script WHERE s.scriptid IN (${list})`,
  );
  const still = (after as any[]).filter((r) => r.isdeployed === 'T');
  console.log(`\nVERIFY: ${(after as any[]).length} deployments, ${still.length} still deployed`);
  if (still.length && mode === '--all') for (const r of still) console.log('  still on:', JSON.stringify({ ...r, links: undefined }));
}
main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
