'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';

export default function ClientDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const checkRole = async () => {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        console.log('Client page - User check:', user?.id, userError);

        if (userError || !user) {
          console.error('No user found, redirecting to login');
          router.push('/');
          return;
        }

        // For now, just set as client without database check
        console.log('Setting user as client');
        setUserRole('client');
        setLoading(false);
      } catch (err) {
        console.error('Client page error:', err);
        router.push('/');
      }
    };

    checkRole();
  }, [router]);

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <main className="text-black">
      <Navbar />
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Client Dashboard</h1>
        <p>This is where clients will create and view their orders.</p>
      </div>
    </main>
  );
}
