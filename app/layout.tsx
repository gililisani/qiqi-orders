import { createClient } from '@/lib/supabase-server';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient(); // ✅ must await
  const { data: { session } } = await supabase.auth.getSession(); // ✅ now works

  return (
    <html lang="en">
      <body>
        <SupabaseProvider session={session}>
          {children}
        </SupabaseProvider>
      </body>
    </html>
  );
}
