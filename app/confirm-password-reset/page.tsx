'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function ConfirmPasswordResetPage() {
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    // ✅ Step 1: Verify OTP with token and email
    const { error: verifyError } = await supabase.auth.verifyOtp({
      type: 'recovery',
      token,
      email,
    })

    if (verifyError) {
      setError(verifyError.message)
      setLoading(false)
      return
    }

    // ✅ Step 2: Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess('Password reset successful! Redirecting to login...')
      setTimeout(() => router.push('/'), 2500)
    }

    setLoading(false)
  }

  return (
    <div style={{ padding: 32 }}>
      <h2>Confirm Password Reset</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="text"
          placeholder="Enter 6-digit code"
          value={token}
          required
          onChange={(e) => setToken(e.target.value)}
        />
        <input
          type="password"
          placeholder="Enter new password"
          value={newPassword}
          required
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>

      {success && <p style={{ color: 'green' }}>{success}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}
