'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';


import Link from 'next/link';
import { TagIcon } from '@heroicons/react/24/outline';

interface Class {
  id: string;
  name: string;
  created_at: string;
}

export default function ClassesPage() {
  const router = useRouter();
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

  const filteredClasses = classes.filter(cls =>
    cls.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <>
        <div className="p-6">
          <p>Loading classes...</p>
        </div>
      </>
    );
  }

  return (
    <>
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
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        {error && <p className="text-red-600 mb-4">{error}</p>}

        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Class Name
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
              {filteredClasses.map((cls) => (
                <tr
                  key={cls.id}
                  onClick={() => router.push(`/admin/classes/${cls.id}/edit`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <TagIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div className="text-sm font-medium text-gray-900">{cls.name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(cls.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/admin/classes/${cls.id}/edit`}
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

        {filteredClasses.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No classes found.</p>
            <Link
              href="/admin/classes/new"
              className="mt-4 inline-block bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Add First Class
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
