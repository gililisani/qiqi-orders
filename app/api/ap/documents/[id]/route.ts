import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { AP_BUCKET } from '../../../../../lib/ap/store';

/** GET (ap:view): one document, its history, and a 10-minute link to view the file. */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminWithPermission(request, 'ap:view');
    const { id } = await props.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    const db = createServiceRoleClient();
    const { data: doc, error } = await db.from('ap_documents').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

    const [{ data: events }, { data: vendor }, signed] = await Promise.all([
      db.from('ap_events').select('event, detail, actor, created_at').eq('document_id', id).order('created_at', { ascending: false }).limit(100),
      doc.ns_vendor_id
        ? db.from('ap_vendor_profiles').select('*').eq('ns_vendor_id', doc.ns_vendor_id).maybeSingle()
        : Promise.resolve({ data: null }),
      doc.storage_path
        ? db.storage.from(AP_BUCKET).createSignedUrl(doc.storage_path, 600)
        : Promise.resolve({ data: null }),
    ]);
    return NextResponse.json({ document: doc, vendor, events: events ?? [], fileUrl: signed.data?.signedUrl ?? null });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[ap/documents/:id] GET', err);
    return NextResponse.json({ error: err?.message || 'Failed to load the document.' }, { status: 500 });
  }
}
