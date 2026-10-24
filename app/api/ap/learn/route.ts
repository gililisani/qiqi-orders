import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { createNetSuiteForTarget } from '../../../../lib/shopify/engine/nsTarget';
import { learnFromNetSuite } from '../../../../lib/ap/learnFromNetSuite';
import { apEvent, getApSettings } from '../../../../lib/ap/store';

// Route-level export: vercel.json maxDuration is not honored for Next routes.
export const maxDuration = 120;

/**
 * POST (ap:edit): learn how each vendor is booked from its past bills, in the
 * NetSuite the module posts to (read-only there).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminWithPermission(request, 'ap:edit');
    const db = createServiceRoleClient();
    const { ns_target } = await getApSettings(db);
    let ns;
    try {
      ns = createNetSuiteForTarget(ns_target);
    } catch {
      return NextResponse.json(
        { error: `NetSuite ${ns_target} isn't connected on this environment.` },
        { status: 409 },
      );
    }
    const summary = await learnFromNetSuite(db, ns, { actor: user.id });
    await apEvent(db, null, 'learned', { ...summary, ns_target }, user.id);
    return NextResponse.json({ summary });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[ap/learn] POST', err);
    return NextResponse.json({ error: err?.message || 'Learning from NetSuite failed.' }, { status: 500 });
  }
}
