'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';
import { BanknotesIcon } from '@heroicons/react/24/outline';

interface SupportFund {
  id: string;
  percent: number;
  created_at: string;
}

export default function SupportFundsPage() {
  const router = useRouter();
  const [supportFunds, setSupportFunds] = useState<SupportFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSupportFunds();
  }, []);

  const fetchSupportFunds = async () => {
    try {
      console.log('Fetching support funds...');
      const { data, error } = await supabase
        .from('support_fund_levels')
        .select('*')
        .order('percent', { ascending: true });

      console.log('Support funds query result:', { data, error });

      if (error) {
        console.error('Error fetching support funds:', error);
        setError('Failed to load support funds: ' + error.message);
      } else {
        console.log('Support funds data:', data);
        setSupportFunds(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching support funds:', err);
      setError('An unexpected error occurred: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading support funds...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Support Funds Management</h1>
          <Link
            href="/admin/support-funds/new"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Add New Support Fund Level
          </Link>
        </div>

        {error && <p className="text-red-600 mb-4">{error}</p>}

        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Support Fund Level
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
              {supportFunds.map((fund) => (
                <tr
                  key={fund.id}
                  onClick={() => router.push(`/admin/support-funds/${fund.id}/edit`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <BanknotesIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-green-100 text-green-800">
                        {fund.percent}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(fund.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/admin/support-funds/${fund.id}/edit`}
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

        {supportFunds.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No support fund levels found.</p>
            <Link
              href="/admin/support-funds/new"
              className="mt-4 inline-block bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Add First Support Fund Level
            </Link>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
