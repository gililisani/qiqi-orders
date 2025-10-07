import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Server-side route - can safely use service role key
export async function POST(request: NextRequest) {
  try {
    // Verify the requesting user is an admin
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create client with anon key to verify the requesting user
    const supabaseAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }
    );

    const { data: { user }, error: userError } = await supabaseAnon.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the user is an admin
    const { data: adminData, error: adminError } = await supabaseAnon
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .eq('enabled', true)
      .single();

    if (adminError || !adminData) {
      return NextResponse.json({ error: 'Not authorized - admin access required' }, { status: 403 });
    }

    // Parse request body
    const { name, email, password, enabled } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create admin client with service role key (server-side only)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: name
      }
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'An admin with this email already exists. Please use a different email.' },
          { status: 400 }
        );
      }
      throw authError;
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create admin account' }, { status: 500 });
    }

    // Create the admin profile in the admins table
    const { error: profileError } = await supabaseAdmin
      .from('admins')
      .insert([{
        id: authData.user.id,
        name: name,
        email: email,
        enabled: enabled ?? true
      }]);

    if (profileError) {
      // If profile creation fails, clean up the auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    return NextResponse.json({
      success: true,
      admin: {
        id: authData.user.id,
        name: name,
        email: email,
        enabled: enabled ?? true
      }
    });

  } catch (error: any) {
    console.error('Error creating admin:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create admin' },
      { status: 500 }
    );
  }
}

