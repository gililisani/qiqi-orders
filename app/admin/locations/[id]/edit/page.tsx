'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';


import Link from 'next/link';

export default function EditLocationPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params?.id) ? params.id[0] : (params?.id as string);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ location_name: '', country: '' });

  useEffect(() => {
    const fetchItem = async () => {
      try {
        const { data, error } = await supabase
          .from('Locations')
          .select('id, location_name, country')
          .eq('id', id)
          .single();
        if (error) throw error;
        if (data) setFormData({ location_name: data.location_name || '', country: data.country || '' });
      } catch (err: any) {
        setError(err.message || 'Failed to load location');
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
        .from('Locations')
        .update({
          location_name: formData.location_name,
          country: formData.country || null,
        })
        .eq('id', id);
      if (error) throw error;
      router.push('/admin/locations');
    } catch (err: any) {
      setError(err.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return (
      <>
        <div className="p-6">Loading...</div>
      </>
    );
  }

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Edit Location</h1>
          <Link href="/admin/locations" className="text-gray-600 hover:text-gray-800">← Back</Link>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location Name *</label>
              <input
                type="text"
                name="location_name"
                value={formData.location_name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
              <input
                type="text"
                name="country"
                value={formData.country}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <Link href="/admin/locations" className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition">Cancel</Link>
          </div>
        </form>
      </div>
    </>
  );
}


