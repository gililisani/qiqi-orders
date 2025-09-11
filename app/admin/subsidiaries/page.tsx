'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';

interface Subsidiary {
  id: string;
  name: string;
  created_at: string;
}

export default function SubsidiariesPage() {
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSubsidiaries();
  }, []);

  const fetchSubsidiaries = async () => {
    try {
      const { data, error } = await supabase
        .from('subsidiaries')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching subsidiaries:', error);
        setError('Failed to load subsidiaries.');
      } else {
        setSubsidiaries(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching subsidiaries:', err);
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this subsidiary?')) return;

    try {
      const { error } = await supabase
        .from('subsidiaries')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting subsidiary:', error);
        setError('Failed to delete subsidiary.');
      } else {
        setSubsidiaries(subsidiaries.filter(subsidiary => subsidiary.id !== id));
      }
    } catch (err) {
      console.error('Unexpected error deleting subsidiary:', err);
      setError('An unexpected error occurred.');
    }
  };

  const filteredSubsidiaries = subsidiaries.filter(subsidiary =>
    subsidiary.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading subsidiaries...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Subsidiaries Management</h1>
          <Link
            href="/admin/subsidiaries/new"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Add New Subsidiary
          </Link>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Search subsidiaries by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded shadow-sm focus:outline-none"
          />
        </div>

        {error && <p className="text-red-600 mb-4">{error}</p>}

        {filteredSubsidiaries.length > 0 ? (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {filteredSubsidiaries.map((subsidiary) => (
                <li key={subsidiary.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-gray-900">
                        {subsidiary.name}
                      </h3>
                    </div>
                    <div className="flex space-x-2">
                      <Link
                        href={`/admin/subsidiaries/${subsidiary.id}/edit`}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(subsidiary.id)}
                        className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-center p-10 border rounded-lg bg-gray-50">
            <p className="text-lg text-gray-700 mb-4">No subsidiaries found. Start by adding a new subsidiary!</p>
            <Link
              href="/admin/subsidiaries/new"
              className="mt-4 inline-block bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Add Your First Subsidiary
            </Link>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
