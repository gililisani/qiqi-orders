'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function ResetPasswordPage() {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    const params = new URLSearchParams(hash.substring(1))
    const token = params.get('access_token')
    if (token) {
      setAccessToken(token)
      // Manually set the session using the token
      supabase.auth.setSession({
        access_token: token,
        refresh_token: params.get('refresh_token') || ''
      })
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newPassword) {
      setMessage('Please enter a new password.')
      return
    }

    setLoading(true)
    setMessage('')

    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    })

    setLoading(false)

    if (error) {
      setMessage(`Error: ${error.message}`)
    } else {
      setMessage('Password reset successfully. You can now log in.')
    }
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Reset Your Password</h1>
      {!accessToken ? (
        <p>Loading token...</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            New Password:{' '}
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          <br />
          <br />
          <button type="submit" disabled={loading}>
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      )}
      {message && <p style={{ marginTop: '1rem' }}>{message}</p>}
    </div>
  )
}
