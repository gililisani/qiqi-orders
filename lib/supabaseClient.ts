// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      // Log and normalize every request supabase-js makes
      fetch: async (url, options: any = {}) => {
        // Ensure objects
        options.headers = { ...(options?.headers || {}) };

        // Force JSON content negotiation to avoid 406 from PostgREST
        options.headers['Accept'] = 'application/json';
        options.headers['Content-Type'] = 'application/json';

        // Debug only the failing endpoint
        if (typeof url === 'string' && url.includes('/rest/v1/clients')) {
          console.debug('[DEBUG] Supabase fetch →', url, {
            headers: options.headers,
            method: options.method || 'GET',
          });
        }

        return fetch(url as string, options);
      },

      // Baseline headers (some envs ignore these unless also set in fetch)
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
    db: { schema: 'public' },
  }
);

// One-off verification call
async function _verifyClientsSelect(uuid: string) {
  const { data, error } = await supabase
    .from('clients')
    .select('name,email')
    .eq('id', uuid)
    .maybeSingle();

  console.log('[VERIFY] clients select → data:', data, 'error:', error);
}
_verifyClientsSelect('1f59ab0c-5c32-47fa-b83d-7ba36fe1ed76');
