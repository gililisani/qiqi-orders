'use client';

import React, { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Typography,
  Spinner,
  Alert,
} from '../components/MaterialTailwind';
import TopNavbar from './ui/TopNavbar';
import { useSupabase } from '../../lib/supabase-provider';
import { enforceSessionTimeout } from '../../lib/sessionManager';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading, error, isAdmin, logout } = useAuth('Admin');
  const { supabase } = useSupabase();

  // Check session timeout on component mount
  useEffect(() => {
    if (user && isAdmin) {
      enforceSessionTimeout(supabase, 'admin');
    }
  }, [user, isAdmin, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-blue-gray-50/50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-12 w-12" />
          <Typography variant="h6" color="blue-gray">
            Loading...
          </Typography>
        </div>
      </div>
    );
  }

  if (error || !isAdmin) {
    return (
      <div className="min-h-screen bg-blue-gray-50/50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Alert color="red" className="mb-4">
            {error || 'Access denied. Admin permissions required.'}
          </Alert>
          <Link href="/login">
            <Typography variant="small" color="blue" className="text-center underline">
              Return to Login
            </Typography>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-gray-50/50">
      {/* Full-width sticky top navbar (no max width, no top padding) */}
      <TopNavbar />

      {/* Container with max-width for page content only */}
      <div className="mx-auto w-full max-w-[1600px] px-4 lg:px-6 xl:px-10 pt-12 space-y-16">
        {/* Main Content */}
        <div className="relative">
          {children}
        </div>
      </div>
    </div>
  );
}