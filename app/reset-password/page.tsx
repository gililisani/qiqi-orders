'use client'

import { useEffect, useState } from 'react'

export default function ResetPassword() {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    // Extract the token from the URL fragment
    const hash = window.location.hash
    const params = new URLSearchParams(hash.substring(1))
    const accessToken = params.get('access_token')
    setToken(accessToken)
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
