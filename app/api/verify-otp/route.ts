import { NextResponse } from 'next/server'
import { supabase } from '../../lib/supabaseClient'


export async function POST(req: Request) {
  try {
    const { email, token, newPassword } = await req.json()

    if (!email || !token || !newPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Step 1: Verify the OTP token
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    })

    if (verifyError) {
      return NextResponse.json({ error: verifyError.message }, { status: 400 })
    }

    // Step 2: Look up the user by email to get their ID
    const { data: users, error: getUserError } = await supabase.auth.admin.listUsers()
    if (getUserError) {
      return NextResponse.json({ error: getUserError.message }, { status: 500 })
    }

    const user = users?.users.find((u) => u.email === email)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Step 3: Update the user’s password using the ID
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: newPassword,
    })

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Server error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
