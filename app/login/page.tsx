'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      // Step 1: Authenticate with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError(error.message)
        return
      }

      const { user } = data
      console.log('User authenticated:', user?.id)

      // Step 2: Check if user exists in users table
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      console.log('Profile data:', profile)
      console.log('Profile error:', profileError)

      if (profileError) {
        console.error('Error fetching user profile:', profileError)
        // If user doesn't exist in users table, create them as client
        const { error: insertError } = await supabase
          .from('users')
          .insert([{ id: user.id, role: 'client' }])

        if (insertError) {
          console.error('Error creating user profile:', insertError)
          setError('Failed to create user profile. Please contact support.')
          return
        }
        
        // Redirect to client after creating profile
        router.push('/client')
        return
      }

      // Step 3: Redirect based on role
      if (profile?.role === 'admin') {
        router.push('/admin')
      } else {
        router.push('/client')
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('An unexpected error occurred. Please try again.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="w-full max-w-md p-8 border border-gray-200 rounded-xl shadow-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Qiqi Orders</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full px-4 py-2 border rounded-md"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full px-4 py-2 border rounded-md"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div className="text-right">
            <a 
              href="/reset-password" 
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              Forgot Password?
            </a>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full py-2 bg-black text-white rounded-md hover:bg-gray-800"
          >
            Log In
          </button>
        </form>
      </div>
    </div>
  )
}
