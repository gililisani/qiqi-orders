'use client';

import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Typography,
  Spinner,
  Alert,
} from '../components/MaterialTailwind';
import TopNavbar from './ui/TopNavbar';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading, error, isAdmin, logout } = useAuth('Admin');
  const [authReady, setAuthReady] = React.useState(false);

  // Add small delay to ensure auth context is fully established
  React.useEffect(() => {
    if (!loading && user && isAdmin) {
      const timer = setTimeout(() => {
        setAuthReady(true);
      }, 100); // 100ms delay to ensure auth context is ready
      
      return () => clearTimeout(timer);
    } else {
      setAuthReady(false);
    }
  }, [loading, user, isAdmin]);

  if (loading || !authReady) {
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