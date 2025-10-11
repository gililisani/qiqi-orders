import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Check for orphaned auth users and missing auth users
 * GET /api/users/sync-check
 */
export async function GET(request: NextRequest) {
  try {
    // Create Supabase admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Get all auth users
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (authError) throw authError;

    // Get all client records
    const { data: clients, error: clientsError } = await supabaseAdmin
      .from('clients')
      .select('id, email, name, company_id');

    if (clientsError) throw clientsError;

    // Get all admin records
    const { data: admins, error: adminsError } = await supabaseAdmin
      .from('admins')
      .select('id, email, name');

    if (adminsError) throw adminsError;

    // Create sets for comparison (combine clients AND admins)
    const authUserIds = new Set(authUsers.users.map(u => u.id));
    const clientIds = new Set(clients?.map(c => c.id) || []);
    const adminIds = new Set(admins?.map(a => a.id) || []);
    const allUserIds = new Set([...clientIds, ...adminIds]);

    // Find orphaned auth users (in auth but not in clients OR admins table)
    const orphanedAuthUsers = authUsers.users.filter(u => !allUserIds.has(u.id));

    // Find missing auth users (in clients/admins table but not in auth)
    const missingAuthClients = clients?.filter(c => !authUserIds.has(c.id)) || [];
    const missingAuthAdmins = admins?.filter(a => !authUserIds.has(a.id)) || [];
    const missingAuthUsers = [...missingAuthClients, ...missingAuthAdmins];

    return NextResponse.json({
      success: true,
      summary: {
        totalAuthUsers: authUsers.users.length,
        totalClients: clients?.length || 0,
        totalAdmins: admins?.length || 0,
        orphanedAuthUsers: orphanedAuthUsers.length,
        missingAuthUsers: missingAuthUsers.length
      },
      orphanedAuthUsers: orphanedAuthUsers.map(u => ({
        id: u.id,
        email: u.email,
        createdAt: u.created_at
      })),
      missingAuthClients: missingAuthClients.map(c => ({
        id: c.id,
        email: c.email,
        name: c.name,
        company_id: c.company_id
      })),
      missingAuthAdmins: missingAuthAdmins.map(a => ({
        id: a.id,
        email: a.email,
        name: a.name
      }))
    });

  } catch (error: any) {
    console.error('Error checking user sync:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check user sync' },
      { status: 500 }
    );
  }
}

/**
 * Clean up orphaned auth users
 * POST /api/users/sync-check
 */
export async function POST(request: NextRequest) {
  try {
    const { action, userIds } = await request.json();

    if (action !== 'cleanup' || !Array.isArray(userIds)) {
      return NextResponse.json(
        { error: 'Invalid request. Expected action: "cleanup" and userIds array' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const results: {
      success: string[];
      failed: Array<{ userId: string; error: string }>;
    } = {
      success: [],
      failed: []
    };

    // Delete each orphaned auth user
    for (const userId of userIds) {
      try {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
        if (error) throw error;
        results.success.push(userId);
      } catch (err: any) {
        results.failed.push({ userId, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${results.success.length} orphaned auth users`,
      results
    });

  } catch (error: any) {
    console.error('Error cleaning up orphaned users:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clean up orphaned users' },
      { status: 500 }
    );
  }
}

