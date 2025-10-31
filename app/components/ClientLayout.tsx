'use client';

import { useAuth } from '../hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AdminLayoutWrapper from './template/AdminLayoutWrapper';
import { clientRoutes } from '../config/client-routes';
import { Spinner } from '@material-tailwind/react';

interface ClientLayoutProps {
  children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/');
        return;
      }
      if (user.role !== 'Client') {
        router.push('/admin');
        return;
      }
    }
  }, [user, loading, router]);

  // Add small delay to ensure auth context is fully established
  useEffect(() => {
    if (!loading && user && user.role === 'Client') {
      const timer = setTimeout(() => {
        setAuthReady(true);
      }, 100); // 100ms delay to ensure auth context is ready
      
      return () => clearTimeout(timer);
    } else {
      setAuthReady(false);
    }
  }, [loading, user]);

  if (loading || !authReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Spinner className="h-12 w-12 mx-auto mb-4" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined} />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'Client') {
    return null;
  }

  return (
    <AdminLayoutWrapper routes={clientRoutes}>
      {children}
    </AdminLayoutWrapper>
  );
}
