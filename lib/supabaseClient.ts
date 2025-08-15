// lib/supabaseClient.ts

import { createClient as createSupabaseClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const createClient = () => {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey)
}

export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey)
