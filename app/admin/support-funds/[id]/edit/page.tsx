'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import AdminLayout from '../../../../components/AdminLayout';
import Link from 'next/link';

export default function EditSupportFundPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [percent, setPercent] = useState<number>(0);

  useEffect(() => {
    const fetchItem = async () => {
      try {
        const { data, error } = await supabase
          .from('support_fund_levels')
          .select('id, percent')
          .eq('id', id)
          .single();

        if (error) throw error;
        if (data) setPercent(data.percent ?? 0);
      } catch (err: any) {
        setError(err.message || 'Failed to load support fund');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchItem();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { error } = await supabase
        .from('support_fund_levels')
        .update({ percent })
        .eq('id', id);
      if (error) throw error;
      router.push('/admin/support-funds');
    } catch (err: any) {
      setError(err.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">Loading...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Edit Support Fund Level</h1>
          <Link href="/admin/support-funds" className="text-gray-600 hover:text-gray-800">← Back</Link>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="max-w-md space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Percentage *</label>
            <input
              type="number"
              value={percent}
              min={0}
              max={100}
              step={0.1}
              onChange={(e) => setPercent(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              required
            />
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <Link href="/admin/support-funds" className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition">Cancel</Link>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}


