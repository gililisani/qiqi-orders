import { after, NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { AP_BUCKET, AP_MAX_BYTES, apEvent, safeFileName, sha256, sniffMime } from '../../../../lib/ap/store';
import { liveApDeps } from '../../../../lib/ap/deps';
import { processDocument } from '../../../../lib/ap/process';

// Route-level export: vercel.json maxDuration is not honored for Next routes.
// Reading runs after the response (after()), inside this budget.
export const maxDuration = 60;

const PAGE = 25;

/** Status groups the inbox filters by. */
const GROUPS: Record<string, string[]> = {
  open: ['received', 'reading', 'needs_review', 'unpaid', 'error', 'posting'],
  posted: ['posted'],
  closed: ['rejected', 'not_invoice', 'duplicate', 'attached'],
};

/**
 * GET (ap:view): the AP inbox, newest first, paged by "older than this one"
 * (stays fast at any size). ?group=open|posted|closed|all &q= &before=<iso>|<id>
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'ap:view');
    const params = request.nextUrl.searchParams;
    const db = createServiceRoleClient();

    let q = db
      .from('ap_documents')
      .select('id, source, email_from, email_subject, email_received_at, file_name, status, ns_vendor_id, invoice_number, invoice_date, total, currency, ns_target, ns_bill_id, ns_payment_id, error, created_at, primary_document_id, attachments:proposal->attachments')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE + 1);
    const group = params.get('group') ?? 'open';
    if (GROUPS[group]) q = q.in('status', GROUPS[group]);
    const search = (params.get('q') ?? '').replace(/[^\p{L}\p{N}@.\-_+ ]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (search) {
      const p = `*${search}*`;
      q = q.or([`file_name.ilike.${p}`, `email_from.ilike.${p}`, `email_subject.ilike.${p}`, `invoice_number.ilike.${p}`].join(','));
    }
    const before = params.get('before');
    if (before) {
      const [ts, id] = before.split('|');
      if (ts && id && /^[0-9a-f-]{36}$/i.test(id)) {
        q = q.or(`created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${id})`);
      }
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const page = rows.slice(0, PAGE);

    const vendorIds = [...new Set(page.map((d) => d.ns_vendor_id).filter(Boolean))] as string[];
    const { data: vendors } = vendorIds.length
      ? await db.from('ap_vendor_profiles').select('ns_vendor_id, vendor_name').in('ns_vendor_id', vendorIds)
      : { data: [] as Array<{ ns_vendor_id: string; vendor_name: string }> };
    const vendorName = new Map((vendors ?? []).map((v) => [v.ns_vendor_id, v.vendor_name]));

    const last = page[page.length - 1];
    return NextResponse.json({
      documents: page.map((d) => ({ ...d, vendor_name: d.ns_vendor_id ? vendorName.get(d.ns_vendor_id) ?? null : null })),
      next: rows.length > PAGE && last ? `${last.created_at}|${last.id}` : null,
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[ap/documents] GET', err);
    return NextResponse.json({ error: err?.message || 'Failed to load the AP inbox.' }, { status: 500 });
  }
}

/**
 * POST (ap:edit): register a file uploaded with /api/ap/documents/upload-url.
 * The server re-reads the stored bytes: real file type, size and fingerprint
 * (the same PDF uploaded twice is kept once).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAdminWithPermission(request, 'ap:edit');
    const { path, fileName } = await request.json();
    const storagePath = String(path ?? '');
    if (!/^uploads\/\d{4}-\d{2}\/[0-9a-f-]{36}\/[^/]+$/i.test(storagePath)) {
      return NextResponse.json({ error: 'Unknown upload.' }, { status: 400 });
    }
    const db = createServiceRoleClient();
    const { data: blob, error: dlErr } = await db.storage.from(AP_BUCKET).download(storagePath);
    if (dlErr || !blob) return NextResponse.json({ error: 'The upload did not arrive — try again.' }, { status: 400 });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const reject = async (message: string) => {
      await db.storage.from(AP_BUCKET).remove([storagePath]);
      return NextResponse.json({ error: message }, { status: 400 });
    };
    if (bytes.byteLength > AP_MAX_BYTES) return reject('Files must be under 20 MB.');
    const mime = sniffMime(bytes);
    if (!mime) return reject('That file is not a PDF or an image.');

    const hash = sha256(bytes);
    const { data: existing } = await db.from('ap_documents').select('id, status, file_name').eq('sha256', hash).maybeSingle();
    if (existing) {
      await db.storage.from(AP_BUCKET).remove([storagePath]);
      return NextResponse.json({ document: existing, duplicate: true });
    }

    const { data: doc, error } = await db
      .from('ap_documents')
      .insert({
        source: 'upload',
        file_name: safeFileName(fileName ?? storagePath.split('/').pop()),
        mime_type: mime,
        storage_path: storagePath,
        sha256: hash,
        bytes: bytes.byteLength,
        status: 'received',
        uploaded_by: user.id,
      })
      .select('id, status, file_name')
      .single();
    if (error) throw new Error(error.message);
    await apEvent(db, doc.id, 'uploaded', { file_name: doc.file_name, bytes: bytes.byteLength }, user.id);
    // Read it right away, after answering the browser.
    after(async () => {
      try {
        await processDocument(db, doc.id, await liveApDeps(db));
      } catch (err) {
        console.error('[ap/documents] read after upload', err);
      }
    });
    return NextResponse.json({ document: doc, duplicate: false });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[ap/documents] POST', err);
    return NextResponse.json({ error: err?.message || 'Could not save the upload.' }, { status: 500 });
  }
}
