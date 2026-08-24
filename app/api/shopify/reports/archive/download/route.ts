import { NextRequest, NextResponse } from 'next/server';
import { requireAdminWithPermission } from '../../../../../../platform/auth/guards';
import { createStorage } from '../../../../../../platform/storage';

/** Download one archived report (path-checked to the finance-reports/ prefix). */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'netsuite');
    const path = request.nextUrl.searchParams.get('path') ?? '';
    if (!path.startsWith('finance-reports/') || path.includes('..')) {
      return NextResponse.json({ error: 'bad path' }, { status: 400 });
    }
    const bytes = await createStorage().getObject(path);
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${path.split('/').pop()}"`,
      },
    });
  } catch (err: any) {
    const status = err?.status === 401 || err?.status === 403 ? err.status : 500;
    return NextResponse.json({ error: String(err?.message ?? err).slice(0, 300) }, { status });
  }
}
