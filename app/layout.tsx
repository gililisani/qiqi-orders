// app/layout.tsx

import './globals.css'
import { SupabaseProvider } from '../lib/supabase-provider'
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Qiqi Orders',
  description: 'Submit and manage your Qiqi distributor orders',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerComponentClient({ cookies })
  const {
    data: { session },
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
