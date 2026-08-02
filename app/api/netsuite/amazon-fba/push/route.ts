import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { createNetSuiteAPI } from '../../../../../lib/netsuite';
import {
  missingConfigFields,
  validatePushInput,
  pushMonthToNetSuite,
  type AmazonFbaConfig,
  type MonthPushInput,
} from '../../../../../lib/amazonFba/pushToNetSuite';

export const maxDuration = 300; // lot queries + several record creates

/**
 * POST — push one Amazon month to NetSuite.
 *
 * Idempotency, in layers:
 *   1. amazon_fba_batches UNIQUE(period): a 'pushed' batch blocks re-push;
 *      a 'pushing' row blocks concurrent double-clicks.
 *   2. Every NS record carries an AMAZON-FBA-* external id — even if the Hub
 *      lost track, NetSuite refuses duplicates and we re-link instead.
 * A failed batch row can be retried: already-created records are detected
 * step by step and only the missing ones get created.
 */
export async function POST(request: NextRequest) {
  const supabaseAdmin = createServiceRoleClient();
  let period: string | undefined;
  try {
    const admin = await requireAdminWithPermission(request, 'netsuite');
    const body = await request.json();

    const input: MonthPushInput = {
      period: String(body.period || ''),
      periodLabel: String(body.periodLabel || ''),
      tranDate: String(body.tranDate || ''),
      saleLines: Array.isArray(body.saleLines) ? body.saleLines : [],
      discountTotal: Number(body.discountTotal) || 0,
      refundTotal: Number(body.refundTotal) || 0,
      feeLines: Array.isArray(body.feeLines) ? body.feeLines : [],
      reimbursementTotal: Number(body.reimbursementTotal) || 0,
    };
    period = input.period;

    const inputErrors = validatePushInput(input);
    if (inputErrors.length > 0) {
      return NextResponse.json({ error: inputErrors.join(' ') }, { status: 400 });
    }

    const { data: config, error: configError } = await supabaseAdmin
      .from('amazon_fba_config')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (configError || !config) {
      return NextResponse.json(
        { error: 'Amazon FBA config not found — run the migration and complete Settings first.' },
        { status: 400 }
      );
    }
    const missing = missingConfigFields(config as AmazonFbaConfig, input);
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing NetSuite IDs in Settings: ${missing.join(', ')}.` },
        { status: 400 }
      );
    }

    // Claim the period. UNIQUE(period) turns concurrent pushes into an error
    // here instead of duplicate NS records.
    const { data: existingBatch } = await supabaseAdmin
      .from('amazon_fba_batches')
      .select('id, status, payload')
      .eq('period', input.period)
      .maybeSingle();

    if (existingBatch?.status === 'pushed') {
      return NextResponse.json(
        { error: `${input.periodLabel} was already pushed to NetSuite.` },
        { status: 409 }
      );
    }
    if (existingBatch?.status === 'pushing') {
      return NextResponse.json(
        { error: `${input.periodLabel} is being pushed right now — wait for it to finish.` },
        { status: 409 }
      );
    }

    if (existingBatch) {
      // Retry of a prepared/failed batch. Merge the pushed input OVER the
      // stored preview instead of replacing it — a failed push must leave the
      // batch renderable as a month card (preview fields like needsAttention).
      await supabaseAdmin
        .from('amazon_fba_batches')
        .update({
          status: 'pushing',
          payload: { ...(existingBatch.payload || {}), ...input },
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingBatch.id);
    } else {
      const { error: insertError } = await supabaseAdmin.from('amazon_fba_batches').insert({
        period: input.period,
        status: 'pushing',
        payload: input,
        created_by: admin.id,
      });
      if (insertError) {
        return NextResponse.json(
          { error: `Could not claim ${input.periodLabel} (another push may be running): ${insertError.message}` },
          { status: 409 }
        );
      }
    }

    const ns = createNetSuiteAPI();
    try {
      const results = await pushMonthToNetSuite(ns, config as AmazonFbaConfig, input);
      const nsRefs: Record<string, { nsId?: string; tranId?: string; status: string }> = {};
      for (const r of results) nsRefs[r.step] = { nsId: r.nsId, tranId: r.tranId, status: r.status };

      await supabaseAdmin
        .from('amazon_fba_batches')
        .update({ status: 'pushed', ns_refs: nsRefs, error: null, updated_at: new Date().toISOString() })
        .eq('period', input.period);

      return NextResponse.json({ success: true, results });
    } catch (pushError: any) {
      await supabaseAdmin
        .from('amazon_fba_batches')
        .update({ status: 'failed', error: pushError.message?.slice(0, 2000), updated_at: new Date().toISOString() })
        .eq('period', input.period);
      return NextResponse.json(
        { error: `Push failed: ${pushError.message}. Already-created records are kept; fix the issue and push again — existing records are detected and skipped.` },
        { status: 500 }
      );
    }
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Amazon FBA push error:', error);
    return NextResponse.json({ error: error.message || 'Push failed.' }, { status: 500 });
  }
}
