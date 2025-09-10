'use client'

import { createBrowserClient } from '@supabase/ssr'
import { Session } from '@supabase/supabase-js'
import { ReactNode, createContext, useContext, useState } from 'react'

interface SupabaseContextType {
  supabase: ReturnType<typeof createBrowserClient>
  session: Session | null
}

const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined)

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
    <SupabaseContext.Provider value={{ supabase, session }}>
      {children}
    </SupabaseContext.Provider>
  )
}

export function useSupabase() {
  const context = useContext(SupabaseContext)
  if (!context) {
    throw new Error('useSupabase must be used within SupabaseProvider')
  }
  return context
}