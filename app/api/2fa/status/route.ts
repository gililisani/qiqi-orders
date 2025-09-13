import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const userType = searchParams.get('userType');

    if (!userId || !userType) {
      return NextResponse.json({ error: 'User ID and type required' }, { status: 400 });
    }

    if (!['admin', 'client'].includes(userType)) {
      return NextResponse.json({ error: 'Invalid user type' }, { status: 400 });
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

    const tableName = userType === 'admin' ? 'admins' : 'clients';
    
    // Get user's 2FA status
    const { data: user, error: userError } = await supabase
      .from(tableName)
      .select('two_factor_enabled, two_factor_verified_at, recovery_codes')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      twoFactorEnabled: user.two_factor_enabled || false,
      verifiedAt: user.two_factor_verified_at,
      hasRecoveryCodes: user.recovery_codes && user.recovery_codes.length > 0
    });

  } catch (error) {
    console.error('2FA status error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
