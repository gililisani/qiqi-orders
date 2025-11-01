'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayoutWrapper from '../../components/template/AdminLayoutWrapper';
import { adminRoutes } from '../../config/admin-routes';
import Link from 'next/link';
import { ShieldCheckIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

interface Admin {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  created_at: string;
}

export default function AdminsPage() {
  const router = useRouter();
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    try {
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setAdmins(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    if (!confirm('Are you sure you want to delete this admin? This action cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('admins')
        .delete()
        .eq('id', adminId);

      if (error) throw error;
      fetchAdmins(); // Refresh the list
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleEnabled = async (adminId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('admins')
        .update({ enabled: !currentStatus })
        .eq('id', adminId);

      if (error) throw error;
      fetchAdmins(); // Refresh the list
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredAdmins = admins.filter(admin =>
    admin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    admin.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <AdminLayoutWrapper routes={adminRoutes}>
        <div className="p-6">
          <p>Loading admins...</p>
        </div>
      </AdminLayoutWrapper>
    );
  }

  return (
    <AdminLayoutWrapper routes={adminRoutes}>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Admins</h1>
          <Link
            href="/admin/admins/new"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Add New Admin
          </Link>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="mb-6">
          <input
            type="text"
            placeholder="Search admins by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Admin
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAdmins.map((admin) => (
                <tr
                  key={admin.id}
                  onClick={() => router.push(`/admin/admins/${admin.id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <ShieldCheckIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{admin.name}</div>
                        <div className="text-sm text-gray-500">{admin.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {admin.enabled ? (
                        <>
                          <CheckCircleIcon className="h-5 w-5 text-green-500" />
                          <span className="text-sm text-gray-900">Enabled</span>
                        </>
                      ) : (
                        <>
                          <XCircleIcon className="h-5 w-5 text-red-500" />
                          <span className="text-sm text-gray-500">Disabled</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(admin.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/admin/admins/${admin.id}/edit`}
                      className="text-black hover:opacity-70 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAdmins.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No admins found.</p>
            <Link
              href="/admin/admins/new"
              className="mt-2 inline-block bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Add First Admin
            </Link>
          </div>
        )}
      </div>
    </AdminLayoutWrapper>
  );
}
