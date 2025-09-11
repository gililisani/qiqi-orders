import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId, email, name, role } = await request.json();
    console.log('User profile API - POST request:', { userId, email, name, role });

    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

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

    console.log('User not found in either table, creating new admin...');
    const { data: newAdmin, error: insertError } = await supabase
      .from('admins')
      .insert([{ id: userId, email: email, name: name, enabled: true }])
      .select()
      .single();

    console.log('Admin creation result:', { newAdmin, insertError });

    if (insertError) {
      console.error('Error creating admin:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    console.log('Admin created successfully');
    return NextResponse.json({ 
      success: true, 
      user: { ...newAdmin, role: 'Admin' }, 
      isNew: true 
    });

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

    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

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