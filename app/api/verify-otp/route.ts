import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function POST(req: Request) {
  const { email, token, newPassword } = await req.json()

  // Step 1: Verify OTP
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'recovery',
    token,
    email,
  })

  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 400 })
  }

  // Step 2: Fetch user ID
  const userList = await supabase.auth.admin.listUsers()
  const users = userList.data.users as { id: string; email?: string }[]
  const user = users.find((u) => u.email === email)

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Step 3: Update password
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { password: newPassword }
  )

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ message: 'Password updated successfully' })
}
