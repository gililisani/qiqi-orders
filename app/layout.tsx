// app/layout.tsx
import './globals.css'
import { ReactNode } from 'react'
import SupabaseProvider from './components/SupabaseProvider'
import { createClient } from '@/lib/supabaseClient' // or supabase-server if you're SSR-ing
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Qiqi Orders',
  description: 'Distributors order page',
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  const supabase = createClient()
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
