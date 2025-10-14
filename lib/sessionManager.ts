'use client';

import { SupabaseClient } from '@supabase/supabase-js';

// Session timeout constants
const CLIENT_SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
const ADMIN_SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 1 day in milliseconds

interface SessionCheckResult {
  shouldLogout: boolean;
  reason?: string;
}

/**
 * Check if the current session should be terminated based on user role and session age
 */
export async function checkSessionTimeout(
  supabase: SupabaseClient,
  role: 'admin' | 'client'
): Promise<SessionCheckResult> {
  try {
    // Get current session
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return { shouldLogout: false }; // No session, nothing to check
    }

    // Get session start time (calculate from expiry time - token lifetime)
    const tokenLifetime = 60 * 60 * 1000; // 1 hour in milliseconds (default Supabase JWT lifetime)
    const sessionStartTime = new Date(session.expires_at).getTime() - tokenLifetime;
    const currentTime = Date.now();
    const sessionAge = currentTime - sessionStartTime;

    // Determine timeout based on role
    const timeout = role === 'admin' ? ADMIN_SESSION_TIMEOUT : CLIENT_SESSION_TIMEOUT;

    // Check if session has exceeded timeout
    if (sessionAge > timeout) {
      return {
        shouldLogout: true,
        reason: `Session expired after ${role === 'admin' ? '1 day' : '2 hours'} of inactivity`
      };
    }

    return { shouldLogout: false };
  } catch (error) {
    console.error('Error checking session timeout:', error);
    return { shouldLogout: false }; // Don't logout on error
  }
}

/**
 * Enforce session timeout - call this on app/page load
 */
export async function enforceSessionTimeout(
  supabase: SupabaseClient,
  role: 'admin' | 'client'
): Promise<void> {
  const result = await checkSessionTimeout(supabase, role);

  if (result.shouldLogout) {
    console.log('Session timeout:', result.reason);
    
    // Sign out the user
    await supabase.auth.signOut();
    
    // Redirect to login
    window.location.href = '/';
  }
}

/**
 * Get human-readable session timeout for display
 */
export function getSessionTimeoutMessage(role: 'admin' | 'client'): string {
  return role === 'admin' 
    ? 'Your session will expire after 1 day of inactivity'
    : 'Your session will expire after 2 hours of inactivity';
}

