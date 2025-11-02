'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import Card from '../../../components/ui/Card';
import Link from 'next/link';

interface Admin {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  created_at: string;
}

export default function AdminViewPage() {
  const params = useParams();
  const adminId = params.id as string;
  
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (adminId) {
      fetchAdmin();
    }
  }, [adminId]);

  const fetchAdmin = async () => {
    try {
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('id', adminId)
        .single();

      if (error) throw error;
      setAdmin(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!admin) return;

    try {
      const { error } = await supabase
        .from('admins')
        .update({ enabled: !admin.enabled })
        .eq('id', adminId);

      if (error) throw error;
      setAdmin(prev => prev ? { ...prev, enabled: !prev.enabled } : null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
          <p>Loading admin...</p>
        </div>
    );
  }

  if (error || !admin) {
    return (
      <div className="p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Admin Not Found</h1>
            <p className="text-gray-600 mb-4">{error || 'The admin you are looking for does not exist.'}</p>
            <Link
              href="/admin/admins"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Back to Admins
            </Link>
          </div>
        </div>
    );
  }

  return (
    <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{admin.name}</h1>
          <div className="flex space-x-2">
            <Link
              href={`/admin/admins/${admin.id}/edit`}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
            >
              Edit Admin
            </Link>
            <Link
              href="/admin/admins"
              className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition"
            >
              Back to Admins
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Admin Details */}
          <Card header={<h2 className="font-semibold">Admin Details</h2>}>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Full Name</label>
                <p className="text-lg">{admin.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Email Address</label>
                <p className="text-lg">{admin.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Status</label>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-full text-sm ${
                    admin.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {admin.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <button
                    onClick={handleToggleEnabled}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {admin.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Admin ID</label>
                <p className="text-sm font-mono text-gray-600">{admin.id}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Created</label>
                <p className="text-lg">{new Date(admin.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </Card>

          {/* Permissions */}
          <Card header={<h2 className="font-semibold">Admin Permissions</h2>}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Manage Products</span>
                <span className="text-green-600 text-sm font-medium">✓ Full Access</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Manage Companies</span>
                <span className="text-green-600 text-sm font-medium">✓ Full Access</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Manage Users</span>
                <span className="text-green-600 text-sm font-medium">✓ Full Access</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Manage Admins</span>
                <span className="text-green-600 text-sm font-medium">✓ Full Access</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">View Orders</span>
                <span className="text-green-600 text-sm font-medium">✓ Full Access</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">System Settings</span>
                <span className="text-green-600 text-sm font-medium">✓ Full Access</span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> Admins have complete access to all system features and data.
              </p>
            </div>
          </Card>
        </div>
      </div>
  );
}
