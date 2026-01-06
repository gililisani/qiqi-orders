'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { handleApiError } from '../../lib/error-handler';

export type UserRole = 'Admin' | 'Client';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  company_id?: string;
}

export function useAuth(requiredRole?: UserRole) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if user is authenticated
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !authUser) {
        console.log('No authenticated user, redirecting to login');
        router.push('/');
        return;
      }

      // Get user profile using API route
      const profileResponse = await fetch(`/api/user-profile?userId=${authUser.id}`);
      const profileData = await profileResponse.json();

      if (!profileData.success || !profileData.user) {
        console.error('Error fetching user profile:', profileData.error);
        setError('User profile not found. Please contact support.');
        return;
      }

      const profile = profileData.user;

      const userData: AuthUser = {
        id: profile.id,
        email: profile.email || authUser.email || '',
        role: profile.role as UserRole,
        name: profile.name || authUser.user_metadata?.full_name || 'User',
        company_id: profile.company_id
      };

      setUser(userData);

      // Check role requirements
      if (requiredRole) {
        if (userData.role !== requiredRole) {
          console.log(`Access denied. Required: ${requiredRole}, User has: ${userData.role}`);
          setError(`Access denied. You need ${requiredRole} permissions.`);
          
          // Redirect based on user's actual role
          if (userData.role === 'Admin') {
            router.push('/admin');
          } else {
            router.push('/client');
          }
          return;
        }
      }

    } catch (err: any) {
      console.error('Auth error:', err);
      const errorInfo = handleApiError(err);
      setError(errorInfo.error);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    // Dispatch event to allow components to save drafts before logout
    window.dispatchEvent(new CustomEvent('before-logout'));
    
    // Small delay to allow draft save to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await supabase.auth.signOut();
    router.push('/');
  };

  return {
    user,
    loading,
    error,
    logout,
    isAdmin: user?.role === 'Admin',
    isClient: user?.role === 'Client'
  };
}
