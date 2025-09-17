'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';

interface PaymentTerm {
  id: number;
  name: string;
  description?: string;
  created_at: string;
}

export default function PaymentTermsPage() {
  const [paymentTerms, setPaymentTerms] = useState<PaymentTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPaymentTerms();
  }, []);

  const fetchPaymentTerms = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_terms')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setPaymentTerms(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this payment term?')) return;

    try {
      const { error } = await supabase
        .from('payment_terms')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchPaymentTerms(); // Refresh the list
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading payment terms...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Payment Terms Management</h1>
          <Link
            href="/admin/payment-terms/new"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Add New Payment Term
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
              {paymentTerms.map((term) => (
                <tr key={term.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {term.name}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">
                      {term.description || 'No description'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(term.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      <Link
                        href={`/admin/payment-terms/${term.id}/edit`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(term.id)}
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

        {paymentTerms.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No payment terms found.</p>
            <p className="text-sm mt-2">
              <Link href="/admin/payment-terms/new" className="text-blue-600 hover:text-blue-800">
                Add the first payment term
              </Link>
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
