// app/components/SupabaseProvider.tsx
'use client'

import { ReactNode, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { createContext } from 'react'
import { Session, SupabaseClient } from '@supabase/supabase-js'

// Optional: create your own context if you want to use the client later
export const SupabaseContext = createContext<SupabaseClient | null>(null)

interface SupabaseProviderProps {
  children: ReactNode
  session: Session | null
}

export default function SupabaseProvider({ children }: SupabaseProviderProps) {
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )

  return (
    <SupabaseContext.Provider value={supabase}>
      {children}
    </SupabaseContext.Provider>
  )
}
