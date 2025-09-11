'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';

interface SupportFund {
  id: string;
  percent: number;
  created_at: string;
}

export default function SupportFundsPage() {
  const [supportFunds, setSupportFunds] = useState<SupportFund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSupportFunds();
  }, []);

  const fetchSupportFunds = async () => {
    try {
      const { data, error } = await supabase
        .from('support_fund_levels')
        .select('*')
        .order('percent', { ascending: true });

      if (error) {
        console.error('Error fetching support funds:', error);
        setError('Failed to load support funds.');
      } else {
        setSupportFunds(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching support funds:', err);
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this support fund level?')) return;

    try {
      const { error } = await supabase
        .from('support_fund_levels')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting support fund:', error);
        setError('Failed to delete support fund level.');
      } else {
        setSupportFunds(supportFunds.filter(fund => fund.id !== id));
      }
    } catch (err) {
      console.error('Unexpected error deleting support fund:', err);
      setError('An unexpected error occurred.');
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

        {supportFunds.length > 0 ? (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {supportFunds.map((fund) => (
                <li key={fund.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-gray-900">
                        {fund.percent}%
                      </h3>
                    </div>
                    <div className="flex space-x-2">
                      <Link
                        href={`/admin/support-funds/${fund.id}/edit`}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(fund.id)}
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
            <p className="text-lg text-gray-700 mb-4">No support fund levels found. Start by adding a new level!</p>
            <Link
              href="/admin/support-funds/new"
              className="mt-4 inline-block bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Add Your First Support Fund Level
            </Link>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
