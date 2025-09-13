import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { generateTOTPCode, verifyTOTPCode, verifyRecoveryCode } from '../../../../lib/2fa';

export async function POST(request: NextRequest) {
  try {
    const { userId, userType, code, isRecoveryCode = false } = await request.json();

    if (!userId || !userType || !code) {
      return NextResponse.json({ error: 'User ID, type, and code required' }, { status: 400 });
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
    
    // Get user's 2FA data
    const { data: user, error: userError } = await supabase
      .from(tableName)
      .select('totp_secret, recovery_codes, two_factor_enabled')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    let isValid = false;

    if (isRecoveryCode) {
      // Verify recovery code
      if (!user.recovery_codes || user.recovery_codes.length === 0) {
        return NextResponse.json({ error: 'No recovery codes available' }, { status: 400 });
      }
      
      isValid = verifyRecoveryCode(user.recovery_codes, code);
      
      if (isValid) {
        // Remove used recovery code
        const updatedCodes = user.recovery_codes.filter((c: string) => c !== code.toUpperCase());
        await supabase
          .from(tableName)
          .update({ recovery_codes: updatedCodes })
          .eq('id', userId);
      }
    } else {
      // Verify TOTP code
      if (!user.totp_secret) {
        return NextResponse.json({ error: '2FA not set up' }, { status: 400 });
      }
      
      isValid = verifyTOTPCode(user.totp_secret, code);
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    // If this is the first verification, enable 2FA
    if (!user.two_factor_enabled && !isRecoveryCode) {
      const { error: enableError } = await supabase
        .from(tableName)
        .update({
          two_factor_enabled: true,
          two_factor_verified_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (enableError) {
        console.error('Error enabling 2FA:', enableError);
        return NextResponse.json({ error: 'Failed to enable 2FA' }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      message: isRecoveryCode ? 'Recovery code verified' : '2FA code verified'
    });

  } catch (error) {
    console.error('2FA verification error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
