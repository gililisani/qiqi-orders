// app/components/SupabaseContext.ts

import { createContext, useContext } from 'react';
import { SupabaseClient, Session } from '@supabase/supabase-js';

type SupabaseContextType = {
  supabase: SupabaseClient;
  session: Session | null;
};

export const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);

export function useSupabase() {
  const context = useContext(SupabaseContext);
  if (!context) throw new Error('useSupabase must be used within SupabaseProvider');
  return context;
}
