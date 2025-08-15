// app/layout.tsx
import './globals.css'
import { ReactNode } from 'react'
import { createClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { Session, SupabaseClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

export const metadata = {
  title: 'Qiqi Orders',
  description: 'Submit and manage your Qiqi distributor orders',
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = cookies()
  const supabase = createClient()
  const {
    data: { session }
  } = await supabase.auth.getSession()

  return (
    <html lang="en">
      <body>
        <SupabaseProvider session={session}>
          {children}
        </SupabaseProvider>
      </body>
    </html>
  )
}

// Create a new file for the provider in the next step
