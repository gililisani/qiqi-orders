'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';

interface Class {
  id: string;
  name: string;
  created_at: string;
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error fetching classes:', error);
        setError('Failed to load classes.');
      } else {
        setClasses(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching classes:', err);
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this class?')) return;

    try {
      const { error } = await supabase
        .from('classes')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting class:', error);
        setError('Failed to delete class.');
      } else {
        setClasses(classes.filter(cls => cls.id !== id));
      }
    } catch (err) {
      console.error('Unexpected error deleting class:', err);
      setError('An unexpected error occurred.');
    }
  };

  const filteredClasses = classes.filter(cls =>
    cls.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading classes...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Classes Management</h1>
          <Link
            href="/admin/classes/new"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Add New Class
          </Link>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Search classes by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded shadow-sm focus:outline-none"
          />
        </div>

        {error && <p className="text-red-600 mb-4">{error}</p>}

        {filteredClasses.length > 0 ? (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {filteredClasses.map((cls) => (
                <li key={cls.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-gray-900">
                        {cls.name}
                      </h3>
                    </div>
                    <div className="flex space-x-2">
                      <Link
                        href={`/admin/classes/${cls.id}/edit`}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(cls.id)}
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
            <p className="text-lg text-gray-700 mb-4">No classes found. Start by adding a new class!</p>
            <Link
              href="/admin/classes/new"
              className="mt-4 inline-block bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Add Your First Class
            </Link>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
