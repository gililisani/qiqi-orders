import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdmin, requireAuthenticatedUser } from '../../../platform/auth/guards';

export async function POST(request: NextRequest) {
  try {
    /**
     * This route is used by the app to fetch a profile after login.
     * Previously it would auto-create an admin if the user didn't exist — that is a privilege-escalation vulnerability.
     *
     * New behavior:
     * - **Admins** may upsert profiles intentionally (explicit, admin-only).
     * - **Non-admins** can only fetch their own profile via GET.
     */
    await requireAdmin(request);
    const { userId, email, name } = await request.json();
    if (!userId || !email || !name) {
      return NextResponse.json({ error: 'Missing required fields: userId, email, name' }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    console.log('Checking if user exists in admins...');
    const { data: existingAdmin, error: adminCheckError } = await supabase
      .from('admins')
      .select('id, name, email, enabled')
      .eq('id', userId)
      .single();

    console.log('Admin check result:', { existingAdmin, adminCheckError });

    if (existingAdmin) {
      console.log('User is admin, returning profile');
      return NextResponse.json({ 
        success: true, 
        user: { ...existingAdmin, role: 'Admin' }, 
        isNew: false 
      });
    }

    console.log('Checking if user exists in clients...');
    const { data: existingClient, error: clientCheckError } = await supabase
      .from('clients')
      .select('id, name, email, enabled, company_id')
      .eq('id', userId)
      .single();

    console.log('Client check result:', { existingClient, clientCheckError });

    if (existingClient) {
      console.log('User is client, returning profile');
      return NextResponse.json({ 
        success: true, 
        user: { ...existingClient, role: 'Client' }, 
        isNew: false 
      });
    }

    // No auto-provisioning here; provisioning should be done via explicit admin tools/routes.
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });

  } catch (error) {
    console.error('User profile API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    console.log('User profile API - GET request for userId:', userId);

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const requester = await requireAuthenticatedUser(request);
    if (!requester.roles.includes('admin') && requester.id !== userId) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const supabase = createServiceRoleClient();

    console.log('Looking up user profile in admins...');
    const { data: admin, error: adminError } = await supabase
      .from('admins')
      .select('id, name, email, enabled')
      .eq('id', userId)
      .single();

    console.log('Admin lookup result:', { admin, adminError });

    if (admin) {
      console.log('User found as admin');
      return NextResponse.json({ 
        success: true, 
        user: { ...admin, role: 'Admin' } 
      });
    }

    console.log('Looking up user profile in clients...');
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, name, email, enabled, company_id')
      .eq('id', userId)
      .single();

    console.log('Client lookup result:', { client, clientError });

    if (client) {
      console.log('User found as client');
      return NextResponse.json({ 
        success: true, 
        user: { ...client, role: 'Client' } 
      });
    }

    console.log('User not found in either table');
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });

  } catch (error) {
    console.error('User profile API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}