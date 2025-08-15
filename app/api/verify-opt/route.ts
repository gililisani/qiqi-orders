// app/api/verify-otp/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabaseClient'

export async function POST(req: Request) {
  const body = await req.json()
  const { email, token, newPassword } = body

  if (!email || !token || !newPassword) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Step 1: Verify OTP
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'recovery'
  })

  if (verifyError) {
    console.error('OTP verification error:', verifyError.message)
    return NextResponse.json({ error: verifyError.message }, { status: 400 })
  }

  // Step 2: Update password
  const { error: updateError } = await supabase.auth.admin.updateUserByEmail(email, {
    password: newPassword,
  })

  if (updateError) {
    console.error('Password update error:', updateError.message)
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ message: 'Password updated successfully' }, { status: 200 })
}
