import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission } from '@/platform/auth/guards';
import {
  parseSnapshotCsv,
  writeSnapshot,
  readSnapshotStatus,
} from '@/lib/inventory/openingSnapshot';

// GET — current snapshot status (cutoff date, row count, uploaded time).
export async function GET(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const status = await readSnapshotStatus();
    return NextResponse.json(status);
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[opening-snapshot GET]', err);
    return NextResponse.json({ error: err?.message || 'Failed to load' }, { status: 500 });
  }
}

// POST { cutoffDate, csv } — import a NetSuite opening-balance saved-search CSV.
export async function POST(request: NextRequest) {
  try {
    await requireWithPermission(request, 'netsuite');
    const body = await request.json().catch(() => ({}));
    const cutoffDate = String(body.cutoffDate || '').trim();
    const csv = String(body.csv || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
      return NextResponse.json({ error: 'cutoffDate (YYYY-MM-DD) required' }, { status: 400 });
    }
    if (!csv.trim()) return NextResponse.json({ error: 'csv content required' }, { status: 400 });

    const { rows, errors } = parseSnapshotCsv(csv);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No usable rows parsed.', details: errors }, { status: 400 });
    }
    await writeSnapshot(cutoffDate, rows);
    return NextResponse.json({
      success: true,
      cutoffDate,
      imported: rows.length,
      warnings: errors.slice(0, 20),
      warningCount: errors.length,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[opening-snapshot POST]', err);
    return NextResponse.json({ error: err?.message || 'Import failed' }, { status: 500 });
  }
}
