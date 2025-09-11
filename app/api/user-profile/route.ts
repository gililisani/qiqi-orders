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

    // Check if user already exists
    console.log('Checking if user exists...');
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id, role, name, email, enabled')
      .eq('id', userId)
      .single();

    console.log('User check result:', { existingUser, checkError });

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking user:', checkError);
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    if (existingUser) {
      // User exists, return their role
      console.log('User exists, returning profile');
      return NextResponse.json({ 
        success: true, 
        user: existingUser,
        isNew: false 
      });
    }

    // User doesn't exist, create them
    console.log('User does not exist, creating new user...');
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{
        id: userId,
        email: email,
        name: name,
        role: role,
        enabled: true
      }])
      .select()
      .single();

    console.log('User creation result:', { newUser, insertError });

    if (insertError) {
      console.error('Error creating user:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    console.log('User created successfully');
    return NextResponse.json({ 
      success: true, 
      user: newUser,
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

    console.log('Looking up user profile...');
    const { data: user, error } = await supabase
      .from('users')
      .select('id, role, name, email, enabled')
      .eq('id', userId)
      .single();

    console.log('User lookup result:', { user, error });

    if (error) {
      console.error('Error looking up user:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('User found successfully');
    return NextResponse.json({ 
      success: true, 
      user 
    });

  } catch (error) {
    console.error('User profile API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
