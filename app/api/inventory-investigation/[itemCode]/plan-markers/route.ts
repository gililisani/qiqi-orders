import { NextRequest, NextResponse } from 'next/server';
import { requireWithPermission, createServiceRoleClient } from '@/platform/auth/guards';

// Plan markers — "I plan to fix this" notes attached to a transaction. They are
// decision-tracking only (change no real data) and survive a refresh-from-NS
// because they key on (item_code, ns_transaction_id), which a re-pull never touches.

// POST — upsert a marker.
export async function POST(
  request: NextRequest,
  { params }: { params: { itemCode: string } },
) {
  try {
    await requireWithPermission(request, 'netsuite');
    const code = decodeURIComponent(params.itemCode).trim().toUpperCase();
    const body = await request.json().catch(() => ({}));
    const nsTransactionId = String(body.nsTransactionId || '').trim();
    if (!code || !nsTransactionId) {
      return NextResponse.json({ error: 'itemCode and nsTransactionId required' }, { status: 400 });
    }

    const sb = createServiceRoleClient();
    const { error } = await sb.from('inv_inv_plan_markers').upsert(
      {
        item_code: code,
        ns_transaction_id: nsTransactionId,
        planned_action: body.plannedAction ?? null,
        proposed_value: body.proposedValue ?? null,
        note: body.note ?? null,
      },
      { onConflict: 'item_code,ns_transaction_id' },
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[plan-markers POST]', err);
    return NextResponse.json({ error: err?.message || 'Failed to save marker' }, { status: 500 });
  }
}

// DELETE — remove a marker by ?nsTransactionId=
export async function DELETE(
  request: NextRequest,
  { params }: { params: { itemCode: string } },
) {
  try {
    await requireWithPermission(request, 'netsuite');
    const code = decodeURIComponent(params.itemCode).trim().toUpperCase();
    const nsTransactionId = new URL(request.url).searchParams.get('nsTransactionId')?.trim();
    if (!code || !nsTransactionId) {
      return NextResponse.json({ error: 'itemCode and nsTransactionId required' }, { status: 400 });
    }
    const sb = createServiceRoleClient();
    const { error } = await sb
      .from('inv_inv_plan_markers')
      .delete()
      .eq('item_code', code)
      .eq('ns_transaction_id', nsTransactionId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[plan-markers DELETE]', err);
    return NextResponse.json({ error: err?.message || 'Failed to remove marker' }, { status: 500 });
  }
}
