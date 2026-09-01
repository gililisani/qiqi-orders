import { NextRequest } from 'next/server';

/**
 * Invoke another App Router route handler in-process, forwarding only the
 * caller's Authorization header. Orchestration routes (accept / cancel /
 * request-changes) compose the existing single-step routes this way instead
 * of duplicating their audited logic — the inner route runs its own guard
 * against the same bearer token, so composition never widens access.
 */
export async function callRouteHandler(
  handler: (req: NextRequest) => Promise<Response>,
  original: NextRequest,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: any }> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const auth = original.headers.get('authorization');
  if (auth) headers.set('authorization', auth);

  const req = new NextRequest(
    new Request(`${original.nextUrl.origin}/api/_internal`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  );
  const res = await handler(req);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}
