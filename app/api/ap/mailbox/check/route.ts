import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { liveApDeps } from '../../../../../lib/ap/deps';
import { checkMailbox } from '../../../../../lib/ap/mailbox';

// Route-level export: vercel.json maxDuration is not honored for Next routes.
export const maxDuration = 300;

/** POST (ap:edit): check the AP mailbox now (the same run the 5-minute schedule does). */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'ap:edit');
    const db = createServiceRoleClient();
    const result = await checkMailbox(db, await liveApDeps(db), { budgetMs: 240_000 });
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[ap/mailbox/check] POST', err);
    return NextResponse.json({ error: err?.message || 'Checking the mailbox failed.' }, { status: 500 });
  }
}
