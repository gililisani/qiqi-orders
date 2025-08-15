import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { createServerSupabase } from '@/lib/supabase-server';
import SupabaseProvider from './supabase-provider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Qiqi Orders',
  description: 'Distributor Order Portal',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase(); // ✅ FIX: await this
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <html lang="en">
      <body className={inter.className}>

          {children}

      </body>
    </html>
  );
}
