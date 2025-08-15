import './globals.css';
import type { ReactNode } from 'react';
import { createServerSupabase } from '@/lib/supabaseServer';

export const metadata = {
  title: 'Qiqi Orders',
  description: 'Submit and manage your Qiqi distributor orders',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const supabaseServer = await createServerSupabase();
  const { data: { session } } = await supabaseServer.auth.getSession();

  return (
    <html lang="en">
      <body>
        {/* Session object is available to your UI. You can pass it via props or a custom context provider */}
        {children}
      </body>
    </html>
  );
}
