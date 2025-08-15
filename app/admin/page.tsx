'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import Navbar from '../components/Navbar';

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const checkUserRole = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!user || userError) {
        router.push('/');
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error || !data) {
        router.push('/');
        return;
      }

      if (data.role === 'admin') {
        setAuthorized(true);
      } else {
        router.push('/client');
      }

      setLoading(false);
    };

    checkUserRole();
  }, [router]);

  if (loading) return <p className="p-6">Loading...</p>;

  if (!authorized) return null;

  return (
    <main className="text-black">
      <Navbar />
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
        <p>This is where you’ll manage users, products, and orders.</p>
      </div>
    </main>
  );
}
