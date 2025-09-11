'use client';

import { useAuth } from '../hooks/useAuth';
import Navbar from './Navbar';

interface ClientLayoutProps {
  children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const { user, loading, error, isClient } = useAuth('Client');

  if (loading) {
    return (
      <main className="text-black">
        <Navbar />
        <div className="p-6">
          <p>Loading...</p>
        </div>
      </main>
    );
  }

  if (error || !isClient) {
    return (
      <main className="text-black">
        <Navbar />
        <div className="p-6">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error || 'Access denied. Client permissions required.'}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="text-black">
      <Navbar />
      {children}
    </main>
  );
}
