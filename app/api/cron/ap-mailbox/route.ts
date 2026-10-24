import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { liveApDeps } from '../../../../lib/ap/deps';
import { checkMailbox } from '../../../../lib/ap/mailbox';

// Route-level export: vercel.json maxDuration is not honored for Next routes.
export const maxDuration = 300;

/**
 * Every 5 minutes (vercel.json): new emails in the AP mailbox become AP
 * documents and are read (lib/ap/mailbox). Does nothing until an AP mailbox
 * is set in AP settings.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const db = createServiceRoleClient();
    const result = await checkMailbox(db, await liveApDeps(db), { budgetMs: 240_000 });
    if (result.documents || result.errors.length) console.log('[cron/ap-mailbox]', JSON.stringify(result));
    return NextResponse.json({ success: !result.errors.length, ...result });
  } catch (err: any) {
    console.error('[cron/ap-mailbox] error:', err);
    return NextResponse.json({ error: err?.message || 'AP mailbox run failed' }, { status: 500 });
  }
}
