import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '../../../lib/supabaseClient'

export async function POST(req: NextRequest) {
  try {
    const { email, token, newPassword } = await req.json()

    if (!email || !token || !newPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Step 1: Verify the token
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: 'recovery',
      token,
      email
    })

    if (verifyError) {
      return NextResponse.json({ error: verifyError.message }, { status: 400 })
    }

    // Step 2: Fetch the user by email to get the user ID
    const { data: users, error: userFetchError } = await supabase.auth.admin.listUsers()
    if (userFetchError) {
      return NextResponse.json({ error: userFetchError.message }, { status: 500 })
    }

    const user = Array.isArray(users.users)
      ? users.users.find((u) => u.email === email)
      : null

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Step 3: Update the password using user ID
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: newPassword
    })

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ message: 'Password updated successfully' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
