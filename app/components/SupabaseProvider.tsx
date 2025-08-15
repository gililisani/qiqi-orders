// components/SupabaseProvider.tsx
'use client'

import { ReactNode, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Session } from '@supabase/supabase-js'
import { SessionContextProvider } from '@supabase/auth-helpers-react'

export default function SupabaseProvider({
  children,
  session,
}: {
  children: ReactNode
  session: Session | null
}) {
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  )

  return (
    <SessionContextProvider supabaseClient={supabase} initialSession={session}>
      {children}
    </SessionContextProvider>
  )
}
