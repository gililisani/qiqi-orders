import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ✅ Make sure these env vars are set in Vercel
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { email, token, newPassword } = await req.json()

    // ✅ Step 1: Verify the token (OTP)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    })

    if (verifyError) {
      return NextResponse.json({ error: verifyError.message }, { status: 400 })
    }

    // ✅ Step 2: Find user by email
    const { data: userList, error: userError } = await supabase.auth.admin.listUsers()
    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 })
    }

    const user = userList.users.find((u) => u.email === email)
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // ✅ Step 3: Update the password
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: newPassword,
    })

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 })
  }
}
