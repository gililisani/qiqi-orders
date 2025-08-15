'use client'

import { createBrowserClient } from '@supabase/ssr'
import { Session } from '@supabase/supabase-js'
import { ReactNode, useState } from 'react'

interface SupabaseProviderProps {
  children: ReactNode
  session: Session | null
}

export function SupabaseProvider({ children, session }: SupabaseProviderProps) {
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )

  return (
    // Replace with new <SupabaseContext.Provider> below
    <SessionContextProvider supabaseClient={supabase} initialSession={session}>
      {children}
    </SessionContextProvider>
  )
}
