'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';

interface Incoterm {
  id: number;
  name: string;
  description?: string;
  created_at: string;
}

export default function IncotermsPage() {
  const [incoterms, setIncoterms] = useState<Incoterm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchIncoterms();
  }, []);

  const fetchIncoterms = async () => {
    try {
      const { data, error } = await supabase
        .from('incoterms')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setIncoterms(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this incoterm?')) return;

    try {
      const { error } = await supabase
        .from('incoterms')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchIncoterms(); // Refresh the list
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading incoterms...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Incoterms Management</h1>
          <Link
            href="/admin/incoterms/new"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Add New Incoterm
          </Link>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow border overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {incoterms.map((incoterm) => (
                <tr key={incoterm.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {incoterm.name}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {incoterm.description || 'No description'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(incoterm.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <Link
                        href={`/admin/incoterms/${incoterm.id}/edit`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(incoterm.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {incoterms.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No incoterms found.</p>
            <p className="text-sm mt-2">
              <Link href="/admin/incoterms/new" className="text-blue-600 hover:text-blue-800">
                Add the first incoterm
              </Link>
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
