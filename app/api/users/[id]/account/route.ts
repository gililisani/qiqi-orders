import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdminWithPermission,
} from '../../../../../platform/auth/guards';
import { ALL_PERMISSIONS } from '../../../../../lib/permissions';

/**
 * Admin account management — the server-side replacement for the browser
 * calling `supabase.auth.admin.*` with the anon key (which always failed,
 * unchecked, so email/password changes silently no-op'd) and for
 * browser-direct permission writes (any admin could self-escalate because
 * RLS only asks "are you an admin").
 *
 * PATCH /api/users/[id]/account
 *   Body: { kind: 'admin'|'client', name?, email?, enabled?, permissions?,
 *           password?, company_id? }
 *   Guard: admins:manage for admin targets, users:manage for client targets.
 *
 * DELETE /api/users/[id]/account?kind=admin
 *   Admin targets only (client deletion already goes through /api/users/delete).
 */

const MIN_PASSWORD_LENGTH = 8;

function permFor(kind: string): string {
  return kind === 'admin' ? 'admins:manage' : 'users:manage';
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const targetId = params.id;
    const body = await request.json();
    const kind = body.kind === 'admin' ? 'admin' : 'client';
    const actor = await requireAdminWithPermission(request, permFor(kind));

    const table = kind === 'admin' ? 'admins' : 'clients';
    const supabaseAdmin = createServiceRoleClient();

    const { data: existing, error: existingErr } = await supabaseAdmin
      .from(table)
      .select('id, email, enabled')
      .eq('id', targetId)
      .maybeSingle();
    if (existingErr) throw new Error(`lookup: ${existingErr.message}`);
    if (!existing) {
      return NextResponse.json({ error: `No ${kind} found with that id.` }, { status: 404 });
    }

    // Nobody disables their own account — that's how you lock yourself out.
    if (targetId === actor.id && body.enabled === false) {
      return NextResponse.json(
        { error: 'You cannot disable your own account.' },
        { status: 400 },
      );
    }

    // ---- Profile-row update (only fields provided) ----
    const patch: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.email === 'string' && body.email.trim()) patch.email = body.email.trim();
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (kind === 'client' && typeof body.company_id === 'string' && body.company_id) {
      patch.company_id = body.company_id;
    }
    if (Array.isArray(body.permissions)) {
      patch.permissions = body.permissions.filter((p: string) =>
        (ALL_PERMISSIONS as string[]).includes(p),
      );
    }

    if (Object.keys(patch).length > 0) {
      const { error: updateErr } = await supabaseAdmin
        .from(table)
        .update(patch)
        .eq('id', targetId);
      if (updateErr) throw new Error(`profile update: ${updateErr.message}`);
    }

    // ---- Auth-record update (email / password) — CHECKED, unlike the old
    // browser calls that failed silently for years. ----
    const emailChanged =
      typeof body.email === 'string' && body.email.trim() && body.email.trim() !== existing.email;
    const wantsPassword = typeof body.password === 'string' && body.password.length > 0;

    if (emailChanged || wantsPassword) {
      if (wantsPassword && body.password.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json(
          { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
          { status: 400 },
        );
      }
      const authPatch: { email?: string; password?: string; user_metadata?: Record<string, string> } = {};
      if (emailChanged) {
        authPatch.email = body.email.trim();
        if (patch.name) authPatch.user_metadata = { full_name: String(patch.name) };
      }
      if (wantsPassword) authPatch.password = body.password;

      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(targetId, authPatch);
      if (authErr) {
        return NextResponse.json(
          {
            error:
              `Profile saved, but updating the login ${emailChanged ? 'email' : 'password'} failed: ` +
              `${authErr.message}`,
          },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('[account PATCH] error:', error);
    return NextResponse.json({ error: error.message || 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const targetId = params.id;
    const kind = new URL(request.url).searchParams.get('kind');
    if (kind !== 'admin') {
      return NextResponse.json(
        { error: 'Only admin accounts are deleted here; clients go through /api/users/delete.' },
        { status: 400 },
      );
    }
    const actor = await requireAdminWithPermission(request, 'admins:manage');
    if (targetId === actor.id) {
      return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });
    }

    const supabaseAdmin = createServiceRoleClient();
    const { error: rowErr } = await supabaseAdmin.from('admins').delete().eq('id', targetId);
    if (rowErr) throw new Error(`admins row: ${rowErr.message}`);

    // The old browser call silently failed here, leaving orphaned live
    // credentials for "deleted" admins. Checked now.
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    if (authErr) {
      return NextResponse.json(
        {
          error:
            `Admin profile removed, but deleting the login credential failed: ${authErr.message}. ` +
            'Retry the delete to finish revoking access.',
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('[account DELETE] error:', error);
    return NextResponse.json({ error: error.message || 'Delete failed' }, { status: 500 });
  }
}
