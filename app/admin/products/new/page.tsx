'use client';

import { useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Navbar from '../../../components/Navbar';
import Link from 'next/link';
import ImageUpload from '../../../components/ImageUpload';

interface Category {
  id: number;
  name: string;
  description?: string;
}

export default function NewProductPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
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
    visible_to_americas: true,
    visible_to_international: true,
    qualifies_for_credit_earning: true,
    picture_url: '',
    case_weight: '',
    hs_code: '',
    made_in: '',
    category_id: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase
        .from('Products')
        .insert([{
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
          visible_to_americas: formData.visible_to_americas,
          visible_to_international: formData.visible_to_international,
          qualifies_for_credit_earning: formData.qualifies_for_credit_earning,
          picture_url: formData.picture_url,
          case_weight: formData.case_weight ? parseFloat(formData.case_weight) : null,
          hs_code: formData.hs_code || null,
          made_in: formData.made_in || null
        }]);

      if (error) throw error;

      router.push('/admin/products');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  return (
    <main className="text-black">
      <Navbar />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Add New Product</h1>
          <Link
            href="/admin/products"
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Products
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

          {/* Packing List Fields */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-800 mb-4">Packing List Information</h3>
            <p className="text-sm text-blue-700 mb-4">Required for international shipping and customs documentation</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Case Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="case_weight"
                  value={formData.case_weight}
                  onChange={handleChange}
                  placeholder="e.g., 12.50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  HS Code
                </label>
                <input
                  type="text"
                  name="hs_code"
                  value={formData.hs_code}
                  onChange={handleChange}
                  placeholder="e.g., 3305.10.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Made In
                </label>
                <input
                  type="text"
                  name="made_in"
                  value={formData.made_in}
                  onChange={handleChange}
                  placeholder="e.g., USA, China, Italy"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>
          </div>

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

              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="qualifies_for_credit_earning"
                  checked={formData.qualifies_for_credit_earning}
                  onChange={handleChange}
                  className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Qualifies for Credit Earning</span>
              </label>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <h4 className="text-sm font-medium text-yellow-800 mb-2">Support Fund Settings Explained:</h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li><strong>Eligible for Support Funds:</strong> Can this product be purchased WITH support fund credit?</li>
                <li><strong>Qualifies for Credit Earning:</strong> Does purchasing this product EARN support fund credit?</li>
                <li><strong>Note:</strong> Kits, discounted items, and promotional items typically should NOT qualify for credit earning.</li>
              </ul>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Client Class Visibility</h3>
              <div className="flex space-x-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="visible_to_americas"
                    checked={formData.visible_to_americas}
                    onChange={handleChange}
                    className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Visible to Americas Clients</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    name="visible_to_international"
                    checked={formData.visible_to_international}
                    onChange={handleChange}
                    className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Visible to International Clients</span>
                </label>
              </div>
            </div>
          </div>

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Product'}
            </button>
            <Link
              href="/admin/products"
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
