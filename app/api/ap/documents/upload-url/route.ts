import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../../platform/auth/guards';
import { AP_BUCKET, AP_MAX_BYTES, safeFileName } from '../../../../../lib/ap/store';

const ALLOWED = /\.(pdf|png|jpe?g|webp)$/i;

/**
 * POST (ap:edit): a one-time link to upload one invoice file straight into
 * private storage (files never pass through the server — no size cap from
 * the hosting platform). Register it afterwards with POST /api/ap/documents.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'ap:edit');
    const { fileName, size } = await request.json();
    const name = safeFileName(fileName);
    if (!ALLOWED.test(name)) {
      return NextResponse.json({ error: 'Upload a PDF or an image (PNG, JPG, WEBP).' }, { status: 400 });
    }
    if (!Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > AP_MAX_BYTES) {
      return NextResponse.json({ error: 'Files must be under 20 MB.' }, { status: 400 });
    }
    const month = new Date().toISOString().slice(0, 7);
    const path = `uploads/${month}/${randomUUID()}/${name}`;
    const { data, error } = await createServiceRoleClient().storage.from(AP_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? 'Could not create the upload link.');
    return NextResponse.json({ path: data.path, token: data.token });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[ap/documents/upload-url] POST', err);
    return NextResponse.json({ error: err?.message || 'Could not start the upload.' }, { status: 500 });
  }
}
