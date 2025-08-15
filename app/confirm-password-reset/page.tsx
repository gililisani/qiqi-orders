'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function ConfirmPasswordResetPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const { error } = await supabase.auth.verifyOtp({
      type: 'recovery',
      token,
      password: newPassword,
    })

    if (error) {
      setError(error.message)
    } else {
      setSuccess('Password reset successful! You can now log in.')
      setTimeout(() => {
        router.push('/')
      }, 2000)
    }
  }

  return (
    <div style={{ padding: 32 }}>
      <h2>Confirm Password Reset</h2>
      <form onSubmit={handleSubmit}>
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
        <button type="submit">Reset Password</button>
      </form>
      {success && <p style={{ color: 'green' }}>{success}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  )
}
