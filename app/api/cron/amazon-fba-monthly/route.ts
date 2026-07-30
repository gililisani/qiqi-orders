import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { isAmazonSpConfigured } from '../../../../lib/amazonSp/client';
import { prepareMonthFromAmazon, previousAmazonMonth } from '../../../../lib/amazonFba/prepareMonth';
import {
  missingConfigFields,
  pushMonthToNetSuite,
  type AmazonFbaConfig,
} from '../../../../lib/amazonFba/pushToNetSuite';
import { createNetSuiteAPI } from '../../../../lib/netsuite';
import {
  notifyMonthPrepared,
  notifyMonthPushed,
  notifyMonthFailed,
} from '../../../../lib/amazonFba/notify';

export const maxDuration = 300;

/**
 * Monthly cron (2nd of each month, see vercel.json): prepare the previous
 * month from the Amazon Finances API and email the notify address.
 *
 * - auto_push OFF (default): batch stays 'prepared'; email says
 *   "ready to push" (or lists what needs attention).
 * - auto_push ON: pushes to NetSuite automatically — but ONLY when the month
 *   reconciles, every SKU is mapped, and config is complete. Anything less
 *   falls back to 'prepared' + an alert email. Idempotency (external IDs +
 *   batch registry) makes retries safe in every case.
 *
 * Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAmazonSpConfigured()) {
    return NextResponse.json({ error: 'Amazon SP-API is not configured.' }, { status: 400 });
  }

  const supabaseAdmin = createServiceRoleClient();
  const period = request.nextUrl.searchParams.get('period') || previousAmazonMonth();
  const periodLabel = period; // refined below once the preview exists

  const { data: config } = await supabaseAdmin
    .from('amazon_fba_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  const notifyEmail = config?.notify_email || 'billing@qiqiglobal.com';

  try {
    const result = await prepareMonthFromAmazon(period, supabaseAdmin);
    if (result.status === 'already-pushed' || !result.preview) {
      return NextResponse.json({ success: true, period, status: 'already-pushed' });
    }
    const preview = result.preview;

    const configMissing = config
      ? missingConfigFields(config as AmazonFbaConfig, preview)
      : ['configuration'];
    const perfect = preview.reconciles && configMissing.length === 0;

    if (config?.auto_push && perfect) {
      // Claim the batch exactly like the manual push route does.
      await supabaseAdmin
        .from('amazon_fba_batches')
        .update({ status: 'pushing', updated_at: new Date().toISOString() })
        .eq('period', period)
        .eq('status', 'prepared');
      try {
        const ns = createNetSuiteAPI();
        const results = await pushMonthToNetSuite(ns, config as AmazonFbaConfig, preview);
        const nsRefs: Record<string, unknown> = {};
        for (const r of results) nsRefs[r.step] = { nsId: r.nsId, tranId: r.tranId, status: r.status };
        await supabaseAdmin
          .from('amazon_fba_batches')
          .update({ status: 'pushed', ns_refs: nsRefs, error: null, updated_at: new Date().toISOString() })
          .eq('period', period);
        await notifyMonthPushed(notifyEmail, preview, results);
        return NextResponse.json({ success: true, period, status: 'auto-pushed' });
      } catch (pushError: any) {
        await supabaseAdmin
          .from('amazon_fba_batches')
          .update({ status: 'failed', error: pushError.message?.slice(0, 2000), updated_at: new Date().toISOString() })
          .eq('period', period);
        await notifyMonthFailed(notifyEmail, preview.periodLabel, pushError.message || 'Push failed.');
        return NextResponse.json({ success: false, period, status: 'push-failed', error: pushError.message }, { status: 500 });
      }
    }

    await notifyMonthPrepared(notifyEmail, preview);
    return NextResponse.json({
      success: true,
      period,
      status: 'prepared',
      reconciles: preview.reconciles,
      missingConfig: configMissing,
    });
  } catch (error: any) {
    console.error('Amazon monthly cron error:', error);
    try {
      await notifyMonthFailed(notifyEmail, periodLabel, error.message || 'Unknown error');
    } catch (mailError) {
      console.error('Also failed to send the alert email:', mailError);
    }
    return NextResponse.json({ error: error.message || 'Cron failed.' }, { status: 500 });
  }
}
