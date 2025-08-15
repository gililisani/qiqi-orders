'use client';

import { ReactNode, createContext, useContext, useState } from 'react';
import { supabase as browserSupabase } from '@/lib/supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';

const SupabaseContext = createContext<SupabaseClient | null>(null);

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(() => browserSupabase);
  return <SupabaseContext.Provider value={supabase}>{children}</SupabaseContext.Provider>;
}

export function useSupabase() {
  const ctx = useContext(SupabaseContext);
  if (!ctx) throw new Error('useSupabase must be inside SupabaseProvider');
  return ctx;
}
