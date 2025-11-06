'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import Card from '../../../components/ui/Card';
import Link from 'next/link';

interface StandaloneSLI {
  id: string;
  sli_number: number;
  created_at: string;
  company_id: string | null;
  consignee_name: string;
  company?: {
    company_name: string;
  } | null;
}

export default function SLIDocumentsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [slis, setSlis] = useState<StandaloneSLI[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSLIs();
  }, []);

  const fetchSLIs = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('standalone_slis')
        .select(`
          id,
          sli_number,
          created_at,
          company_id,
          consignee_name,
          company:companies(company_name)
        `)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      
      // Transform data: Supabase returns company as an array, convert to single object
      const transformedData = (data || []).map((sli: any) => ({
        ...sli,
        company: Array.isArray(sli.company) && sli.company.length > 0 
          ? sli.company[0] 
          : null,
      }));
      
      setSlis(transformedData);
    } catch (err: any) {
      console.error('Error fetching SLIs:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sliId: string) => {
    if (!confirm('Are you sure you want to delete this SLI? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/sli/standalone/${sliId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete SLI');
      }

      fetchSLIs(); // Refresh the list
    } catch (err: any) {
      console.error('Error deleting SLI:', err);
      alert('Failed to delete SLI: ' + err.message);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="mt-8 mb-4 space-y-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading SLI documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">SLI Documents</h2>
        <Link
          href="/admin/sli/create"
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
        >
          + Create New SLI
        </Link>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <Card>
        {slis.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">No SLI documents found.</p>
            <Link
              href="/admin/sli/create"
              className="inline-block bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
            >
              Create First SLI
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SLI Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company Name (Consignee)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {slis.map((sli) => (
                  <tr key={sli.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {sli.sli_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(sli.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {sli.consignee_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <Link
                        href={`/admin/sli/${sli.id}/preview`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View
                      </Link>
                      <Link
                        href={`/admin/sli/${sli.id}/edit`}
                        className="text-green-600 hover:text-green-800"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(sli.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

