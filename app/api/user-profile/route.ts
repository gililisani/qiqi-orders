import { createServerSupabase } from '../../../lib/supabase-server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { userId, email, name, role } = await request.json();

    // Use service role to bypass RLS
    const supabase = createServerSupabase();

    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', userId)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    if (existingUser) {
      // User exists, return their role
      return NextResponse.json({ 
        success: true, 
        user: existingUser,
        isNew: false 
      });
    }

    // User doesn't exist, create them
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

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

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

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Use service role to bypass RLS
    const supabase = createServerSupabase();

    const { data: user, error } = await supabase
      .from('users')
      .select('id, role, name, email, enabled')
      .eq('id', userId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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
