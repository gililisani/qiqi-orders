import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { createServerSupabase } from '../lib/supabase-server';
import { SupabaseProvider } from '../lib/supabase-provider';
import MaterialThemeProvider from './components/ThemeProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Qiqi Partners Hub',
  description: 'Qiqi Partnerts Hub',
  icons: {
    icon: [
      { url: '/favicon/favicon 16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon/favicon 32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon/favicon 48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon/favicon 192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/favicon/favicon 256x256.png', sizes: '256x256', type: 'image/png' },
    ],
    apple: [
      { url: '/favicon/favicon 180x180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return (
    <html lang="en">
      <body className={inter.className}>
        <SupabaseProvider session={session}>
          <MaterialThemeProvider>
            {children}
          </MaterialThemeProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}