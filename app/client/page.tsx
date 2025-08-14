'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';

export default function ClientDashboard() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push('/');
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (data?.role !== 'client') {
        router.push('/admin');
      } else {
        setUserRole('client');
      }
    });
  }, []);

  if (!userRole) return <p className="p-6">Loading...</p>;

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

