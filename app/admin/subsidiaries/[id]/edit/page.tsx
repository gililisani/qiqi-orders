'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';


import InnerPageShell from '../../../../components/ui/InnerPageShell';
import Link from 'next/link';

interface FormData {
  name: string;
  ship_from_address: string;
  company_address: string;
  phone: string;
  email: string;
}

export default function EditSubsidiaryPage() {
  const params = useParams();
  const router = useRouter();
  const subsidiaryId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState<FormData>({
    name: '',
    ship_from_address: '',
    company_address: '',
    phone: '',
    email: ''
  });

  useEffect(() => {
    if (subsidiaryId) {
      fetchSubsidiary();
    }
  }, [subsidiaryId]);

  const fetchSubsidiary = async () => {
    try {
      const { data, error } = await supabase
        .from('subsidiaries')
        .select('*')
        .eq('id', subsidiaryId)
        .single();

      if (error) throw error;

      setFormData({
        name: data.name || '',
        ship_from_address: data.ship_from_address || '',
        company_address: data.company_address || '',
        phone: data.phone || '',
        email: data.email || ''
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const { error } = await supabase
        .from('subsidiaries')
        .update({
          name: formData.name,
          ship_from_address: formData.ship_from_address,
          company_address: formData.company_address,
          phone: formData.phone,
          email: formData.email
        })
        .eq('id', subsidiaryId);

      if (error) throw error;

      router.push('/admin/subsidiaries');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (loading) {
    return (
      <
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-10 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <InnerPageShell
        title="Edit Subsidiary"
        breadcrumbs={[{ label: 'Subsidiaries', href: '/admin/subsidiaries' }, { label: 'Edit' }]}
        actions={<Link href="/admin/subsidiaries" className="text-gray-600 hover:text-gray-800">← Back to Subsidiaries</Link>}
      >
        <div className="max-w-4xl mx-auto">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subsidiary Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ship From Address *
            </label>
            <textarea
              name="ship_from_address"
              value={formData.ship_from_address}
              onChange={handleChange}
              required
              rows={4}
              placeholder="Enter full shipping address for this subsidiary..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company Address *
            </label>
            <textarea
              name="company_address"
              value={formData.company_address}
              onChange={handleChange}
              required
              rows={4}
              placeholder="Enter company address for this subsidiary..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="Enter phone number"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="Enter email address"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <Link
              href="/admin/subsidiaries"
              className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition"
            >
              Cancel
            </Link>
          </div>
        </form>
        </div>
      </InnerPageShell>
    </>
  );
}
