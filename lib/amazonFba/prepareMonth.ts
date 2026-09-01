/**
 * Prepare one calendar month from the SP-API: fetch financial events, resolve
 * SKUs, build the MonthPreview, and store it as a 'prepared' batch. Shared by
 * the monthly cron, the page's "Fetch from Amazon" button, and manual runs.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { createNetSuiteAPI } from '../netsuite';
import { getFinancialEvents } from '../amazonSp/client';
import { buildMonthPreviewFromEvents, resolveSellerSkus, resolveSkuList } from './buildFromAmazon';
import { classifyMonthReturns, fetchMonthReturnRows, returnRowSkus } from './returnsRestock';
import type { MonthPreview } from './parseReport';

/** Physical-returns restock automation starts here; earlier months were trued up manually. */
const RETURNS_AUTOMATION_FROM = '2026-09';

export interface PrepareResult {
  status: 'prepared' | 'already-pushed';
  preview?: MonthPreview;
}

export async function prepareMonthFromAmazon(
  period: string, // YYYY-MM
  supabaseAdmin: SupabaseClient
): Promise<PrepareResult> {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error(`Invalid period "${period}".`);

  const { data: existing } = await supabaseAdmin
    .from('amazon_fba_batches')
    .select('id, status')
    .eq('period', period)
    .maybeSingle();
  if (existing?.status === 'pushed') return { status: 'already-pushed' };
  if (existing?.status === 'pushing') {
    throw new Error(`${period} is being pushed right now — try again in a minute.`);
  }

  const [yearStr, monthStr] = period.split('-');
  const lastDay = new Date(Date.UTC(Number(yearStr), Number(monthStr), 0)).getUTCDate();
  const events = await getFinancialEvents(
    `${period}-01T00:00:00Z`,
    `${period}-${String(lastDay).padStart(2, '0')}T23:59:59Z`
  );

  const ns = createNetSuiteAPI();
  const skuMap = await resolveSellerSkus(events, supabaseAdmin, ns);
  const preview = buildMonthPreviewFromEvents(period, events, skuMap);

  // Physical returns for the month (restock preview). A failure here must not
  // sink the whole preparation — store the error and let the push proceed
  // money-only; the drift panel catches any resulting stock gap.
  if (period >= RETURNS_AUTOMATION_FROM) {
    try {
      const returnRows = await fetchMonthReturnRows(period);
      const returnsSkuMap = await resolveSkuList(returnRowSkus(returnRows), supabaseAdmin, ns);
      preview.returns = classifyMonthReturns(returnRows, returnsSkuMap);
    } catch (err: any) {
      preview.returnsError = String(err?.message || err).slice(0, 500);
    }
  }

  if (existing) {
    await supabaseAdmin
      .from('amazon_fba_batches')
      .update({ status: 'prepared', source: 'api', payload: preview, error: null, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    const { error } = await supabaseAdmin
      .from('amazon_fba_batches')
      .insert({ period, status: 'prepared', source: 'api', payload: preview });
    if (error) throw new Error(`Could not store prepared batch: ${error.message}`);
  }

  return { status: 'prepared', preview };
}

/** Previous calendar month in Amazon's (Pacific) timezone: YYYY-MM. */
export function previousAmazonMonth(): string {
  const today = new Date(Date.now() - 7 * 3600 * 1000);
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  return first.toISOString().slice(0, 7);
}
