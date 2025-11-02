'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';


import Link from 'next/link';
import ImageUpload from '../../../components/ImageUpload';
import Card from '../../../components/ui/Card';
import FormField from '../../../components/ui/FormField';

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

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setCategories(data || []);
    } catch (err: any) {
      console.error('Error fetching categories:', err);
    }
  };

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
          made_in: formData.made_in || null,
          category_id: formData.category_id || null
        }]);

      if (error) throw error;

      router.push('/admin/products');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  return (
    <>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Add New Product</h1>
          <Link href="/admin/products" className="text-gray-600 hover:text-gray-900">← Back to Products</Link>
        </div>

        {error && (
          <Card>
            <div className="border border-red-300 bg-red-50 text-red-800 rounded-md px-4 py-3 text-sm">
              {error}
            </div>
          </Card>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <Card header={<h2 className="font-semibold">Basic Information</h2>}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField label="Item Name *" htmlFor="item_name">
                <input
                  id="item_name"
                  type="text"
                  name="item_name"
                  value={formData.item_name}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </FormField>

              <FormField label="NetSuite Name" htmlFor="netsuite_name">
                <input
                  id="netsuite_name"
                  type="text"
                  name="netsuite_name"
                  value={formData.netsuite_name}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </FormField>

              <FormField label="SKU *" htmlFor="sku">
                <input
                  id="sku"
                  type="text"
                  name="sku"
                  value={formData.sku}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </FormField>

              <FormField label="UPC" htmlFor="upc">
                <input
                  id="upc"
                  type="text"
                  name="upc"
                  value={formData.upc}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </FormField>

              <FormField label="Size" htmlFor="size">
                <input
                  id="size"
                  type="text"
                  name="size"
                  value={formData.size}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </FormField>

              <FormField label="Case Pack" htmlFor="case_pack">
                <input
                  id="case_pack"
                  type="number"
                  name="case_pack"
                  value={formData.case_pack}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </FormField>

              <FormField label="Americas Price (USD) *" htmlFor="price_americas">
                <input
                  id="price_americas"
                  type="number"
                  step="0.01"
                  name="price_americas"
                  value={formData.price_americas}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </FormField>

              <FormField label="International Price (USD) *" htmlFor="price_international">
                <input
                  id="price_international"
                  type="number"
                  step="0.01"
                  name="price_international"
                  value={formData.price_international}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </FormField>
            </div>
          </Card>

          <Card header={<h2 className="font-semibold">Product Image</h2>}>
            <ImageUpload
              onImageUploaded={(url) => setFormData(prev => ({ ...prev, picture_url: url }))}
              currentImageUrl={formData.picture_url}
            />
          </Card>

          {/* Packing List Fields */}
          <Card header={<h2 className="font-semibold">Packing List Information</h2>}>
            <p className="text-sm text-gray-600 mb-4">Required for international shipping and customs documentation</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Case Weight (kg)</label>
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  name="category_id"
                  value={formData.category_id}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="">No Category</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Assign this product to a category for better organization</p>
              </div>
            </div>
          </Card>

          <Card header={<h2 className="font-semibold">Visibility & Eligibility</h2>}>
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
          </Card>

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
    </>
  );
}
