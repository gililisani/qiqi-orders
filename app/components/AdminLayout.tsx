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
  const [isNavigating, setIsNavigating] = React.useState(false);

  // Handle navigation loading with pathname changes
  React.useEffect(() => {
    setIsNavigating(false);
  }, []);

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
      {/* Top Navigation Bar */}
      <TopNavbar />

      {/* Main Content */}
      <div className="p-4">
        {/* Page Content */}
        <div className="relative">
          {isNavigating && (
            <div className="absolute inset-0 bg-blue-gray-50/50 flex items-center justify-center z-40">
              <div className="flex flex-col items-center gap-4">
                <Spinner className="h-8 w-8" />
                <Typography variant="small" color="blue-gray">
                  Loading...
                </Typography>
              </div>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}