import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  try {
    const { email, token, newPassword } = await req.json()

    if (!email || !token || !newPassword) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Create a Supabase client using the SERVICE ROLE KEY
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY! // Server-side only
    )

    // Step 1: Verify the OTP
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    })

    if (verifyError) {
      return NextResponse.json({ error: `Verification failed: ${verifyError.message}` }, { status: 400 })
    }

    // Step 2: Update password
    const { error: updateError } = await supabase.auth.admin.updateUserByEmail(email, {
      password: newPassword
    })

    if (updateError) {
      return NextResponse.json({ error: `Password update failed: ${updateError.message}` }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
