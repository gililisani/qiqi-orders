'use client'

import { useState } from 'react'
import { Session, createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { SessionContextProvider } from '@supabase/auth-helpers-react'

interface SupabaseProviderProps {
  children: React.ReactNode
  session: Session | null
}

export function SupabaseProvider({ children, session }: SupabaseProviderProps) {
  const [supabaseClient] = useState(() => createBrowserClient())

  return (
    <SessionContextProvider supabaseClient={supabaseClient} initialSession={session}>
      {children}
    </SessionContextProvider>
  )
}
