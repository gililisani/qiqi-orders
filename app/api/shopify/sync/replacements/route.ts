import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../../lib/shopify/store';
import { createNetSuiteForTarget } from '../../../../../lib/shopify/engine/nsTarget';
import { loadReplacements } from '../../../../../lib/shopify/replacements';

export const maxDuration = 60;

/**
 * Replacements tab: every replacement order, the order it replaces, the
 * original at the root of the chain, the reason and the cost of the goods
 * shipped (NetSuite COGS on its fulfillments). Read-only. If NetSuite is
 * unreachable the list still loads, without costs.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'shopify:view');
    const db = createServiceRoleClient();
    const config = await new ShopifySyncStore(db).getConfig();
    const target = config.mode === 'sandbox' ? 'sandbox' : 'production';

    let costWarning: string | null = null;
    let rows;
    try {
      const ns = createNetSuiteForTarget(target);
      rows = await loadReplacements(db, target, (q) => ns.suiteQL(q));
    } catch (err: any) {
      costWarning = `Costs unavailable: ${String(err?.message ?? err).slice(0, 150)}`;
      rows = await loadReplacements(db, target);
    }

    const prodAccount = process.env.NEXT_PUBLIC_NETSUITE_ACCOUNT_ID;
    const nsBase = (t: string | null) => {
      if (!prodAccount) return null;
      const account = t === 'sandbox' ? `${prodAccount}_SB1` : prodAccount;
      return `https://${account.toLowerCase().replace(/_/g, '-')}.app.netsuite.com`;
    };
    const storeHandle = (process.env.SHOPIFY_STORE_DOMAIN ?? '').replace('.myshopify.com', '');

    return NextResponse.json({
      shopifyAdminBase: storeHandle ? `https://admin.shopify.com/store/${storeHandle}` : null,
      costWarning,
      replacements: rows.map((r) => {
        const base = nsBase(r.nsTarget);
        return {
          ...r,
          fulfillmentLinks: base
            ? r.nsFulfillmentIds.map((id) => `${base}/app/accounting/transactions/itemship.nl?id=${id}`)
            : [],
        };
      }),
    });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
