'use client'

import { SessionContextProvider } from '@supabase/auth-helpers-react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useState } from 'react'

export function SupabaseProvider({
  children,
  session,
}: {
  children: React.ReactNode
  session: any
}) {
  const [supabaseClient] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )

  return (
    <SessionContextProvider supabaseClient={supabaseClient} initialSession={session}>
      {children}
    </SessionContextProvider>
  )
}
