// app/components/SupabaseProvider.tsx

'use client';

import { createBrowserClient } from '@supabase/ssr';
import { Session } from '@supabase/supabase-js';
import { useState } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseContext } from './SupabaseContext';

export default function SupabaseProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  const [supabase] = useState(() =>
    createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  );

  return (
    <SupabaseContext.Provider value={{ supabase, session }}>
      {children}
    </SupabaseContext.Provider>
  );
}
