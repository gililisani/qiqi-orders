import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { email, token, newPassword } = await req.json()

  if (!email || !token || !newPassword) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
  }

  // ✅ Step 1: Verify the token
  const { error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'recovery',
  })

  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 400 })
  }

  // ✅ Step 2: Fetch user ID by email
  const userList = await supabase.auth.admin.listUsers()

  // Add a type here so TypeScript knows what userList.users contains
  const users = userList.users as { id: string; email?: string }[]

  const user = users.find((u) => u.email === email)

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // ✅ Step 3: Update password using user ID
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
  })

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
