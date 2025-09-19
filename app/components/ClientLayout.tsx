'use client';

import { useAuth } from '../hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Image from 'next/image';

interface ClientLayoutProps {
  children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'Client') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-5 z-50 bg-white border border-gray-200 rounded-lg shadow-sm mx-4 sm:mx-6 lg:mx-8 mt-5">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-12">
            <a href="/client" className="flex items-center space-x-3 hover:opacity-90 transition">
              <Image src="/logo.png" alt="Qiqi Logo" width={80} height={32} />
              <h1 className="text-xl font-bold text-gray-900">Partners Hub</h1>
            </a>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">
                Welcome, {user.name}
              </span>
            <button
              onClick={async () => {
                try {
                  await supabase.auth.signOut();
                  window.location.href = '/';
                } catch (error) {
                  console.error('Error signing out:', error);
                  // Force redirect even if signOut fails
                  window.location.href = '/';
                }
              }}
              className="bg-black text-white px-3 py-1.5 rounded text-sm hover:opacity-90 transition"
            >
              Log Out
            </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="sticky top-20 z-40 bg-white border border-gray-200 rounded-lg shadow-sm mx-4 sm:mx-6 lg:mx-8 mt-2">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <a
              href="/client"
              className="border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 px-1 py-4 text-sm font-medium"
            >
              Dashboard
            </a>
            <a
              href="/client/orders/new"
              className="border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 px-1 py-4 text-sm font-medium"
            >
              New Order
            </a>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}