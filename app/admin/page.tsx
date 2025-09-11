'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Navbar from '../components/Navbar';

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const checkRole = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('No user:', userError);
        router.push('/');
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .select('roll')
        .eq('id', user.id)
        .single();

      if (error || !data) {
        console.error('Error fetching user role:', error);
        router.push('/');
        return;
      }

      if (data.roll === 'admin') {
        setUserRole('admin');
      } else {
        router.push('/client');
      }

      setLoading(false);
    };

    checkRole();
  }, [router]);

  if (loading) return <p className="p-6">Loading...</p>;

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
