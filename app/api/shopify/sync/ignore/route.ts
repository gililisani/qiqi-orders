import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { ShopifySyncStore } from '../../../../../lib/shopify/store';

/** Explicit human decision: this order will not sync. Audited, reversible (Retry un-ignores). */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const { shopifyOrderId, note } = await request.json();
    if (!/^\d+$/.test(String(shopifyOrderId ?? '')) || !note?.trim()) {
      return NextResponse.json({ error: 'shopifyOrderId and a note are required' }, { status: 400 });
    }
    const store = new ShopifySyncStore(createServiceRoleClient());
    await store.markIgnored(String(shopifyOrderId), String(note));
    await store.event('orders', 'ignored', String(shopifyOrderId), { note: String(note).slice(0, 500) });
    return NextResponse.json({ result: 'ignored' });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
