import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../../../lib/netsuite';

/**
 * POST — try to resolve the still-missing NetSuite internal IDs (vendor +
 * accounts) via SuiteQL. These lookups need role permissions the integration
 * role may not have yet (Lists → Vendors: View, Lists → Accounts: View), so
 * each probe reports success or the exact failure instead of erroring out.
 * Whatever resolves is saved to amazon_fba_config.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'amazon:edit');
    const ns = createNetSuiteAPI();
    const supabaseAdmin = createServiceRoleClient();

    const resolved: Record<string, string> = {};
    const diagnostics: { probe: string; ok: boolean; detail: string }[] = [];

    // Vendor V5322 AMAZON
    try {
      const vendors = await ns.suiteQL<{ id: string; entityid: string }>(
        `SELECT id, entityid FROM vendor WHERE entityid LIKE 'V5322%' OR LOWER(companyname) LIKE '%amazon%'`
      );
      if (vendors.length > 0) {
        resolved.vendor_ns_id = String(vendors[0].id);
        diagnostics.push({ probe: 'Vendor V5322 AMAZON', ok: true, detail: `Found internal ID ${vendors[0].id} (${vendors[0].entityid})` });
      } else {
        diagnostics.push({ probe: 'Vendor V5322 AMAZON', ok: false, detail: 'Query worked but no matching vendor found — check the vendor exists.' });
      }
    } catch (e: any) {
      diagnostics.push({
        probe: 'Vendor V5322 AMAZON',
        ok: false,
        detail: e.message?.includes('was not found')
          ? 'The integration role cannot see vendors. In NetSuite: Setup → Users/Roles → the integration role → Permissions → Lists → add "Vendors" (View). Or enter the ID manually (open the vendor in NS; the id= in the URL).'
          : e.message?.slice(0, 300) || 'Unknown error',
      });
    }

    // Accounts by number
    const ACCOUNTS: Record<string, string> = {
      '100505': 'bank_account_ns_id',
      '622040': 'platform_fees_account_ns_id',
      '630040': 'advertising_account_ns_id',
      '620070': 'writeoff_account_ns_id',
    };
    try {
      const accounts = await ns.suiteQL<{ id: string; acctnumber: string; fullname: string }>(
        `SELECT id, acctnumber, fullname FROM account WHERE acctnumber IN ('100505', '622040', '630040', '620070')`
      );
      for (const acct of accounts) {
        const field = ACCOUNTS[acct.acctnumber];
        if (field) {
          resolved[field] = String(acct.id);
          diagnostics.push({ probe: `Account ${acct.acctnumber}`, ok: true, detail: `Found internal ID ${acct.id} (${acct.fullname})` });
        }
      }
      const foundNumbers = new Set(accounts.map((a) => a.acctnumber));
      for (const number of Object.keys(ACCOUNTS)) {
        if (!foundNumbers.has(number)) {
          diagnostics.push({ probe: `Account ${number}`, ok: false, detail: 'Query worked but the account was not found by number.' });
        }
      }
    } catch (e: any) {
      diagnostics.push({
        probe: 'Accounts 100505 / 622040 / 630040 / 620070',
        ok: false,
        detail: e.message?.includes('was not found')
          ? 'The integration role cannot see the chart of accounts. In NetSuite: Setup → Users/Roles → the integration role → Permissions → Lists → add "Accounts" (View). Or enter the IDs manually.'
          : e.message?.slice(0, 300) || 'Unknown error',
      });
    }

    if (Object.keys(resolved).length > 0) {
      const { error } = await supabaseAdmin
        .from('amazon_fba_config')
        .upsert({ id: 1, ...resolved, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    }

    const { data: config } = await supabaseAdmin
      .from('amazon_fba_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    return NextResponse.json({ success: true, resolved, diagnostics, config });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Amazon FBA config resolve error:', error);
    return NextResponse.json({ error: error.message || 'Resolve failed.' }, { status: 500 });
  }
}
