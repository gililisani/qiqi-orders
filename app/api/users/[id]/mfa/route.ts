import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdminWithPermission,
} from '../../../../../platform/auth/guards';

/**
 * DELETE /api/users/[id]/mfa — remove ALL of an admin's MFA factors.
 *
 * The lost-phone recovery path: another admin (admins:manage) resets the
 * target's two-factor, the target signs in with password only and re-enrolls
 * at /admin/security. Deleting when nothing is enrolled is a no-op success.
 */
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const targetId = params.id;
    await requireAdminWithPermission(request, 'admins:manage');

    const supabaseAdmin = createServiceRoleClient();

    const { data: target, error: targetErr } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('id', targetId)
      .maybeSingle();
    if (targetErr) throw new Error(`lookup: ${targetErr.message}`);
    if (!target) {
      return NextResponse.json({ error: 'No admin found with that id.' }, { status: 404 });
    }

    const { data: factors, error: listErr } =
      await supabaseAdmin.auth.admin.mfa.listFactors({ userId: targetId });
    if (listErr) throw new Error(`list factors: ${listErr.message}`);

    for (const factor of factors?.factors ?? []) {
      const { error: delErr } = await supabaseAdmin.auth.admin.mfa.deleteFactor({
        id: factor.id,
        userId: targetId,
      });
      if (delErr) throw new Error(`delete factor: ${delErr.message}`);
    }

    return NextResponse.json({
      success: true,
      removed: factors?.factors?.length ?? 0,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('MFA reset error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reset MFA.' },
      { status: 500 },
    );
  }
}
