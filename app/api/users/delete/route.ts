import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin } from '../../../../platform/auth/guards';

export async function DELETE(request: NextRequest) {
  try {
    await requireAdmin(request);

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing required field: userId' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createServiceRoleClient();

    // Atomic DB cleanup: nullify FKs in orders/order_history + delete clients row.
    const { error: rpcError } = await supabaseAdmin.rpc('delete_user_cascade', {
      p_user_id: userId,
    });

    if (rpcError) {
      console.error('[USER_DELETE] DB cleanup failed:', rpcError);
      return NextResponse.json(
        { error: 'Failed to remove user records' },
        { status: 500 }
      );
    }

    // Delete the auth user last. If this fails, the DB is already clean and the
    // operation is idempotent — caller can retry the auth deletion.
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      console.error('[USER_DELETE] Auth deletion failed (DB already cleaned; retry safe):', authError);
      return NextResponse.json(
        { error: 'User records removed but auth deletion failed. Retry to complete.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('[USER_DELETE] Error:', error?.message);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete user' },
      { status: 500 }
    );
  }
}
