'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

export default function AdminDashboard() {
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

      if (data?.role !== 'admin') {
        router.push('/client');
      } else {
        setUserRole('admin');
      }
    });
  }, []);

  if (!userRole) return <p className="p-6">Loading...</p>;

  return (
    <main className="p-6 text-black">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      <p>This is where you’ll manage products, companies, and orders.</p>
    </main>
  );
}
