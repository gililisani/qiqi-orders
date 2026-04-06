import { supabase } from './supabaseClient';

export async function fetchWithAuth(input: RequestInfo | URL, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  const token = session?.access_token;
  if (token) headers.set('Authorization', `Bearer ${token}`);

  return fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? 'same-origin',
  });
}

