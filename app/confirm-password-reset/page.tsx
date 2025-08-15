'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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

    try {
      const response = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token, newPassword }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Something went wrong')
        setLoading(false)
        return
      }

      setSuccess('Password reset successful! Redirecting...')
      setTimeout(() => router.push('/'), 2000)
    } catch (err: any) {
      setError('Failed to fetch')
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
