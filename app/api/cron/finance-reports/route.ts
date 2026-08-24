import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createStorage } from '../../../../platform/storage';
import { buildReportCsv, monthWindow, REPORT_PROVIDERS } from '../../../../lib/shopify/reports';

export const maxDuration = 300;

/**
 * Monthly finance-report archive (vercel.json: 07:00 UTC on the 1st) —
 * writes the just-closed month's Shopify/PayPal/Affirm CSVs to the
 * immutable finance-reports/ archive. Idempotent: existing files stay.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const month = prev.toISOString().slice(0, 7);
    const { from, to } = monthWindow(month);
    const storage = createStorage();
    const existing = new Set((await storage.list(`finance-reports/${month}/`)).map((o) => o.path));
    const results: Array<{ provider: string; created: boolean }> = [];
    for (const provider of REPORT_PROVIDERS) {
      const path = `finance-reports/${month}/${provider}-${month}.csv`;
      if (existing.has(path)) { results.push({ provider, created: false }); continue; }
      const csv = await buildReportCsv(provider, from, to);
      await storage.putObject(path, new TextEncoder().encode(csv), {
        source: `${provider} official API`,
        window: `${from}..${to}`,
        generatedat: new Date().toISOString(),
        sha256: crypto.createHash('sha256').update(csv).digest('hex'),
      });
      results.push({ provider, created: true });
    }
    console.log(`[cron/finance-reports] ${month}: ${JSON.stringify(results)}`);
    return NextResponse.json({ month, results });
  } catch (err: any) {
    const message = String(err?.message ?? err).slice(0, 500);
    console.error('[cron/finance-reports] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
