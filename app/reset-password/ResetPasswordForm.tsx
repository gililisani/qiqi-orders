// app/reset-password/ResetPasswordForm.tsx
'use client'

import { useSearchParams } from 'next/navigation'

export default function ResetPassword() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  return (
    <div style={{ padding: 20 }}>
      <h1>Password Reset</h1>
      <p>Your token is: {token}</p>
      {/* Add real reset logic here later */}
    </div>
  )
}
