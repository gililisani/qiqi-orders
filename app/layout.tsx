// app/layout.tsx
import './globals.css';
import type { ReactNode } from 'react';
import { createServerSupabase } from '../../../lib/supabaseServer';
import { SessionContextProvider } from '@supabase/auth-helpers-react';
import { createBrowserClient } from '@supabase/ssr';

export const metadata = {
  title: 'Qiqi Orders',
  description: 'Submit and manage your Qiqi distributor orders',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const supabaseServer = await createServerSupabase();
  const {
    data: { session },
  } = await supabaseServer.auth.getSession();

  const browserSupabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return (
    <html lang="en">
      <body>
        <SessionContextProvider supabaseClient={browserSupabase} initialSession={session}>
          {children}
        </SessionContextProvider>
      </body>
    </html>
  );
}
