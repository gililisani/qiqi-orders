'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function PasswordResetPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://qiqi-orders.vercel.app/confirm-password-reset'
    })
    if (!error) {
      setSubmitted(true)
    } else {
      alert('Error sending reset instructions: ' + error.message)
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Password Reset</h1>
      {submitted ? (
        <p>We sent you instructions to change your password in an email.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>Email address:</label><br />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ padding: '8px', margin: '8px 0', width: '100%' }}
          />
          <br />
          <button type="submit" style={{ padding: '8px 16px' }}>Send Reset Email</button>
        </form>
      )}
    </div>
  )
}
