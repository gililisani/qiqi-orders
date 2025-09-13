import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { generateTOTPCode, verifyTOTPCode, verifyRecoveryCode } from '../../../../lib/2fa';

export async function POST(request: NextRequest) {
  try {
    const { userId, userType, code, isRecoveryCode = false, secret } = await request.json();
    
    console.log('2FA Verify API - Received data:', { userId, userType, code, isRecoveryCode, hasSecret: !!secret });

    if (!userId || !userType || !code) {
      console.log('2FA Verify API - Missing required fields:', { userId: !!userId, userType: !!userType, code: !!code });
      return NextResponse.json({ 
        error: 'User ID, type, and code required',
        debug: { userId: !!userId, userType: !!userType, code: !!code }
      }, { status: 400 });
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
    console.log('2FA Verify API - Looking up user in table:', tableName, 'with ID:', userId);
    
    // Get user's 2FA data (only if we don't have a provided secret)
    let user = null;
    let userError = null;
    
    if (!secret) {
      const { data: userData, error: userErr } = await supabase
        .from(tableName)
        .select('totp_secret, recovery_codes, two_factor_enabled')
        .eq('id', userId)
        .single();
      
      user = userData;
      userError = userErr;
    }

    console.log('2FA Verify API - User lookup result:', { user, userError, usingProvidedSecret: !!secret });

    if (!secret && (userError || !user)) {
      return NextResponse.json({ 
        error: 'User not found',
        debug: { tableName, userId, userError: userError?.message }
      }, { status: 404 });
    }

    let isValid = false;

    if (isRecoveryCode) {
      // Verify recovery code (requires user data)
      if (!user || !user.recovery_codes || user.recovery_codes.length === 0) {
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
      const totpSecret = secret || user.totp_secret;
      
      if (!totpSecret) {
        console.log('2FA Verify API - No TOTP secret found for user');
        return NextResponse.json({ error: '2FA not set up' }, { status: 400 });
      }
      
      console.log('2FA Verify API - Verifying TOTP code:', { 
        secret: totpSecret.substring(0, 8) + '...', 
        code,
        usingProvidedSecret: !!secret
      });
      isValid = verifyTOTPCode(totpSecret, code);
      console.log('2FA Verify API - TOTP verification result:', isValid);
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 400 });
    }

    // If this is the first verification, enable 2FA
    const shouldEnable2FA = (!user || !user.two_factor_enabled) && !isRecoveryCode;
    
    if (shouldEnable2FA) {
      console.log('2FA Verify API - Enabling 2FA for user:', userId);
      
      const updateData: any = {
        two_factor_enabled: true,
        two_factor_verified_at: new Date().toISOString()
      };
      
      // If we have a provided secret, store it
      if (secret) {
        updateData.totp_secret = secret;
      }
      
      const { error: enableError } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', userId);

      if (enableError) {
        console.error('Error enabling 2FA:', enableError);
        return NextResponse.json({ error: 'Failed to enable 2FA' }, { status: 500 });
      }
      
      console.log('2FA Verify API - 2FA enabled successfully');
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
