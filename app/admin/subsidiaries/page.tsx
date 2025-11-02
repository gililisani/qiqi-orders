'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';


import Link from 'next/link';
import { BuildingOffice2Icon } from '@heroicons/react/24/outline';

interface Subsidiary {
  id: string;
  name: string;
  created_at: string;
  ship_from_address?: string;
  company_address?: string;
  phone?: string;
  email?: string;
}

export default function SubsidiariesPage() {
  const router = useRouter();
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

  const filteredSubsidiaries = subsidiaries.filter(subsidiary =>
    subsidiary.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <>
        <div className="p-6">
          <p>Loading subsidiaries...</p>
        </div>
      </>
    );
  }

  return (
    <>
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
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        {error && <p className="text-red-600 mb-4">{error}</p>}

        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subsidiary
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSubsidiaries.map((subsidiary) => (
                <tr
                  key={subsidiary.id}
                  onClick={() => router.push(`/admin/subsidiaries/${subsidiary.id}/edit`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <BuildingOffice2Icon className="h-5 w-5 text-gray-400 mr-3 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{subsidiary.name}</div>
                        {subsidiary.ship_from_address && (
                          <div className="text-sm text-gray-500 mt-1 line-clamp-1">
                            {subsidiary.ship_from_address.substring(0, 80)}
                            {subsidiary.ship_from_address.length > 80 && '...'}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {subsidiary.phone && <div>📞 {subsidiary.phone}</div>}
                      {subsidiary.email && <div>✉️ {subsidiary.email}</div>}
                      {!subsidiary.phone && !subsidiary.email && <span className="text-gray-400">No contact info</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/admin/subsidiaries/${subsidiary.id}/edit`}
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

        {filteredSubsidiaries.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No subsidiaries found.</p>
            <Link
              href="/admin/subsidiaries/new"
              className="mt-4 inline-block bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Add First Subsidiary
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
