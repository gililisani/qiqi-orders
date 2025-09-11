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
        .select('role')
        .eq('id', user.id)
        .single();

      console.log('Admin page - User role data:', data);
      console.log('Admin page - Error:', error);

      if (error || !data) {
        console.error('Error fetching user role:', error);
        router.push('/');
        return;
      }

      console.log('Admin page - Role check:', data.role, '=== admin?', data.role === 'admin');
      
      if (data.role === 'admin') {
        console.log('Admin page - Setting admin role');
        setUserRole('admin');
      } else {
        console.log('Admin page - Redirecting to client, role was:', data.role);
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
        <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Products</h2>
            <p className="text-gray-600 mb-4">Manage your product catalog, pricing, and availability.</p>
            <a
              href="/admin/products"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition inline-block"
            >
              Manage Products
            </a>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Companies</h2>
            <p className="text-gray-600 mb-4">Manage distributor companies and their settings.</p>
            <button
              disabled
              className="bg-gray-300 text-gray-500 px-4 py-2 rounded cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Orders</h2>
            <p className="text-gray-600 mb-4">View and process distributor orders.</p>
            <button
              disabled
              className="bg-gray-300 text-gray-500 px-4 py-2 rounded cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Locations</h2>
            <p className="text-gray-600 mb-4">Manage warehouse locations for NetSuite.</p>
            <button
              disabled
              className="bg-gray-300 text-gray-500 px-4 py-2 rounded cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Users</h2>
            <p className="text-gray-600 mb-4">Manage user accounts and permissions.</p>
            <button
              disabled
              className="bg-gray-300 text-gray-500 px-4 py-2 rounded cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Reports</h2>
            <p className="text-gray-600 mb-4">View sales reports and analytics.</p>
            <button
              disabled
              className="bg-gray-300 text-gray-500 px-4 py-2 rounded cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
