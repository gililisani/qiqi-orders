import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../../platform/auth/guards';
import { liveApDeps } from '../../../../../../lib/ap/deps';
import { evaluateDocument, processDocument } from '../../../../../../lib/ap/process';
import { apEvent } from '../../../../../../lib/ap/store';

// Route-level export: vercel.json maxDuration is not honored for Next routes.
export const maxDuration = 60;

/**
 * POST (ap:edit): run a document again. Not read yet (or the read failed) →
 * read it; already read → only re-match the vendor and re-propose the bill
 * (no second read). Nothing is written to NetSuite.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAdminWithPermission(request, 'ap:edit');
    const { id } = await props.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    const db = createServiceRoleClient();
    await apEvent(db, id, 'read_requested', null, user.id);
    const { data: doc } = await db.from('ap_documents').select('extraction').eq('id', id).maybeSingle();
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    const deps = await liveApDeps(db);
    const result = doc.extraction ? await evaluateDocument(db, id, deps) : await processDocument(db, id, deps);
    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[ap/documents/:id/read] POST', err);
    return NextResponse.json({ error: err?.message || 'Reading failed.' }, { status: 500 });
  }
}
