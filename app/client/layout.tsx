"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { fetchWithAuth } from '../../lib/fetchWithAuth';
import SharedLayoutWrapper from '../components/template/SharedLayoutWrapper';
import { clientRoutes } from '../config/client-routes';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkClientAccess();
  }, []);

  const checkClientAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/');
      return;
    }

    // Use the server-side profile resolver (avoids .single() 406 loops and keeps role logic consistent)
    try {
      const res = await fetchWithAuth(`/api/user-profile?userId=${user.id}`);
      const data = await res.json().catch(() => ({}));
      const role = typeof data?.user?.role === 'string' ? data.user.role : null;
      if (!res.ok || !data?.success || role?.toLowerCase() !== 'client') {
        router.push('/');
        return;
      }
    } catch {
      router.push('/');
      return;
    }

    setIsAuthenticated(true);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-gray-50/50">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <SharedLayoutWrapper 
      routes={clientRoutes}
      brandName="Client Portal"
    >
      {children}
    </SharedLayoutWrapper>
  );
}

