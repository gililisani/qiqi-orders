import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { generateTOTPSecret, generateRecoveryCodes, generateQRCodeDataURL } from '../../../../lib/2fa';

export async function POST(request: NextRequest) {
  try {
    const { userId, userType } = await request.json();

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

    // Generate 2FA secret and recovery codes
    const totpSecret = generateTOTPSecret();
    const recoveryCodes = generateRecoveryCodes(8);

    // Get user email for QR code
    const tableName = userType === 'admin' ? 'admins' : 'clients';
    const { data: user, error: userError } = await supabase
      .from(tableName)
      .select('email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Generate QR code data URL
    const qrCodeUrl = generateQRCodeDataURL(totpSecret, user.email, 'Qiqi Orders');

    // Store the secret and recovery codes (but don't enable 2FA yet)
    const { error: updateError } = await supabase
      .from(tableName)
      .update({
        totp_secret: totpSecret,
        recovery_codes: recoveryCodes,
        two_factor_enabled: false // Not enabled until verified
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating 2FA setup:', updateError);
      return NextResponse.json({ error: 'Failed to setup 2FA' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      secret: totpSecret,
      recoveryCodes,
      qrCodeUrl,
      message: '2FA setup initiated. Please verify with your authenticator app.'
    });

  } catch (error) {
    console.error('2FA setup error:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
