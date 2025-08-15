'use client'

import { useEffect, useState } from 'react'

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.substring(1) // remove "#"
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      setToken(accessToken)
    }
  }, [])

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Password Reset</h1>
      {token ? (
        <p>Your token is: <code>{token}</code></p>
      ) : (
        <p>Loading token...</p>
      )}
    </div>
  )
}
