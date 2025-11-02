'use client';

import { useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';


import Link from 'next/link';

interface FormData {
  percent: number;
}

export default function NewSupportFundPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<FormData>({
    percent: 0
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Inserting support fund:', formData);
      const { data, error } = await supabase
        .from('support_fund_levels')
        .insert([{
          percent: formData.percent
        }]);

      console.log('Insert result:', { data, error });

      if (error) {
        console.error('Insert error:', error);
        throw error;
      }

      window.location.href = '/admin/support-funds';
    } catch (err: any) {
      console.error('Submit error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: parseFloat(value) || 0
    }));
  };

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Add New Support Fund Level</h1>
          <Link
            href="/admin/support-funds"
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Support Funds
          </Link>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Support Fund Percentage *
            </label>
            <input
              type="number"
              name="percent"
              value={formData.percent}
              onChange={handleChange}
              min="0"
              max="100"
              step="0.1"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="text-sm text-gray-500 mt-1">
              Enter the percentage (0-100) for this support fund level
            </p>
          </div>

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Support Fund Level'}
            </button>
            <Link
              href="/admin/support-funds"
              className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
