'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

export default function ResetPasswordPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const access_token = searchParams.get('access_token')
    if (!access_token) {
      setMessage('Missing access token')
    }
  }, [searchParams])

  const handleReset = async () => {
    setLoading(true)
    const { error } = await supabase.auth.updateUser({
      password: password,
    })
    setLoading(false)

    if (error) {
      setMessage(error.message)
    } else {
      setMessage('Password updated! Redirecting...')
      setTimeout(() => router.push('/login'), 2000)
    }
  }

  return (
    <div style={{ padding: '40px', maxWidth: '400px', margin: 'auto' }}>
      <h2>Reset Password</h2>
      <input
        type="password"
        placeholder="New password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ padding: '10px', width: '100%', marginTop: '10px' }}
      />
      <button
        onClick={handleReset}
        disabled={loading}
        style={{
          padding: '10px',
          marginTop: '15px',
          width: '100%',
          backgroundColor: '#000',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {loading ? 'Updating...' : 'Update Password'}
      </button>
      {message && <p style={{ marginTop: '15px' }}>{message}</p>}
    </div>
  )
}
