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
    
    // Get user's 2FA data
    const { data: user, error: userError } = await supabase
      .from(tableName)
      .select('id, name, email, totp_secret, recovery_codes, two_factor_enabled')
      .eq('id', userId)
      .single();

    return NextResponse.json({
      success: true,
      debug: {
        userId,
        userType,
        tableName,
        userFound: !!user,
        userError: userError?.message,
        userData: user ? {
          id: user.id,
          name: user.name,
          email: user.email,
          hasTotpSecret: !!user.totp_secret,
          secretLength: user.totp_secret?.length || 0,
          hasRecoveryCodes: !!user.recovery_codes,
          recoveryCodesCount: user.recovery_codes?.length || 0,
          twoFactorEnabled: user.two_factor_enabled
        } : null
      }
    });

  } catch (error) {
    console.error('2FA Debug API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      debug: { error: error instanceof Error ? error.message : 'Unknown error' }
    }, { status: 500 });
  }
}
