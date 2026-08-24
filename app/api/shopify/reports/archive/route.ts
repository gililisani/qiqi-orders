import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { createStorage } from '../../../../../platform/storage';
import { buildReportCsv, monthWindow, REPORT_PROVIDERS } from '../../../../../lib/shopify/reports';

export const maxDuration = 300;
const PREFIX = 'finance-reports/';

/** List the immutable monthly archive (grouped client-side). */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const storage = createStorage();
    const objects = await storage.list(PREFIX);
    const files = objects.map((o) => {
      const rel = o.path.startsWith(PREFIX) ? o.path.slice(PREFIX.length) : o.path;
      const [month, name] = [rel.slice(0, 7), rel.split('/').pop() ?? rel];
      return { path: o.path, month, name, bytes: o.bytes, provider: name.split('-')[0] };
    });
    return NextResponse.json({ files });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}

/** Archive one closed month for all three providers (idempotent — existing files are never overwritten). */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const { month } = await request.json();
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month ?? '') || month < '2026-01' || month >= currentMonth) {
      return NextResponse.json({ error: `month must be YYYY-MM, 2026-01 … before ${currentMonth} (closed months only)` }, { status: 400 });
    }
    const { from, to } = monthWindow(month);
    const storage = createStorage();
    const existing = new Set((await storage.list(`${PREFIX}${month}/`)).map((o) => o.path));
    const results: Array<{ provider: string; path: string; bytes: number; created: boolean }> = [];
    for (const provider of REPORT_PROVIDERS) {
      const path = `${PREFIX}${month}/${provider}-${month}.csv`;
      if (existing.has(path)) {
        results.push({ provider, path, bytes: 0, created: false });
        continue;
      }
      const csv = await buildReportCsv(provider, from, to);
      const bytes = new TextEncoder().encode(csv);
      await storage.putObject(path, bytes, {
        source: `${provider} official API`,
        window: `${from}..${to}`,
        generatedat: new Date().toISOString(),
        sha256: crypto.createHash('sha256').update(csv).digest('hex'),
      });
      results.push({ provider, path, bytes: bytes.length, created: true });
    }
    return NextResponse.json({ month, results });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
