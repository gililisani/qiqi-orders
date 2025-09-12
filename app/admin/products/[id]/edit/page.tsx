'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Navbar from '../../../../components/Navbar';
import Link from 'next/link';
import ImageUpload from '../../../../components/ImageUpload';

interface Product {
  id: number;
  item_name: string;
  sku: string;
  price_international: number;
  price_americas: number;
  enable: boolean;
  list_in_support_funds: boolean;
  visible_to_americas: boolean;
  visible_to_international: boolean;
  picture_url?: string;
  netsuite_name?: string;
  upc?: string;
  size?: string;
  case_pack?: number;
  created_at: string;
}

export default function EditProductPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    item_name: '',
    netsuite_name: '',
    sku: '',
    upc: '',
    size: '',
    case_pack: '',
    price_international: '',
    price_americas: '',
    enable: true,
    list_in_support_funds: true,
    picture_url: ''
  });

  useEffect(() => {
    checkAdminAccess();
    fetchProduct();
  }, [params.id]);

  const checkAdminAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/');
      return;
    }

    // Check if user is in admins table
    const { data: adminProfile } = await supabase
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!adminProfile) {
      router.push('/client');
      return;
    }
  };

  const fetchProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('Products')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error) throw error;

      setFormData({
        item_name: data.item_name || '',
        netsuite_name: data.netsuite_name || '',
        sku: data.sku || '',
        upc: data.upc || '',
        size: data.size || '',
        case_pack: data.case_pack?.toString() || '',
        price_international: data.price_international?.toString() || '',
        price_americas: data.price_americas?.toString() || '',
        enable: data.enable ?? true,
        list_in_support_funds: data.list_in_support_funds ?? true,
        // visible_to_americas: data.visible_to_americas ?? true,
        // visible_to_international: data.visible_to_international ?? true,
        picture_url: data.picture_url || ''
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
        .from('Products')
        .update({
          item_name: formData.item_name,
          netsuite_name: formData.netsuite_name,
          sku: formData.sku,
          upc: formData.upc,
          size: formData.size,
          case_pack: formData.case_pack ? parseInt(formData.case_pack) : null,
          price_international: parseFloat(formData.price_international),
          price_americas: parseFloat(formData.price_americas),
          enable: formData.enable,
          list_in_support_funds: formData.list_in_support_funds,
          // visible_to_americas: formData.visible_to_americas,
          // visible_to_international: formData.visible_to_international,
          picture_url: formData.picture_url || null
        })
        .eq('id', params.id);

      if (error) throw error;

      router.push(`/admin/products/${params.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  if (loading) {
    return (
      <main className="text-black">
        <Navbar />
        <div className="p-6">
          <p>Loading product...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="text-black">
      <Navbar />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Edit Product</h1>
          <Link
            href={`/admin/products/${params.id}`}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Product
          </Link>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Item Name *
              </label>
              <input
                type="text"
                name="item_name"
                value={formData.item_name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                NetSuite Name
              </label>
              <input
                type="text"
                name="netsuite_name"
                value={formData.netsuite_name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                SKU *
              </label>
              <input
                type="text"
                name="sku"
                value={formData.sku}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                UPC
              </label>
              <input
                type="text"
                name="upc"
                value={formData.upc}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Size
              </label>
              <input
                type="text"
                name="size"
                value={formData.size}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Case Pack
              </label>
              <input
                type="number"
                name="case_pack"
                value={formData.case_pack}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Americas Price (USD) *
              </label>
              <input
                type="number"
                step="0.01"
                name="price_americas"
                value={formData.price_americas}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                International Price (USD) *
              </label>
              <input
                type="number"
                step="0.01"
                name="price_international"
                value={formData.price_international}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          <ImageUpload
            onImageUploaded={(url) => setFormData(prev => ({ ...prev, picture_url: url }))}
            currentImageUrl={formData.picture_url}
          />

          <div className="space-y-4">
            <div className="flex space-x-6">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="enable"
                  checked={formData.enable}
                  onChange={handleChange}
                  className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Enable Product</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="list_in_support_funds"
                  checked={formData.list_in_support_funds}
                  onChange={handleChange}
                  className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Eligible for Support Funds</span>
              </label>
            </div>

            {/* Class visibility fields temporarily disabled until database migration */}
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
              href={`/admin/products/${params.id}`}
              className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
