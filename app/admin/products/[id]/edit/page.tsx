'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import AdminLayout from '../../../../components/AdminLayout';
import InnerPageShell from '../../../../components/ui/InnerPageShell';
import Link from 'next/link';
import ImageUpload from '../../../../components/ImageUpload';

interface Category {
  id: number;
  name: string;
  sort_order: number;
}

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
  qualifies_for_credit_earning: boolean;
  picture_url?: string;
  netsuite_name?: string;
  upc?: string;
  size?: string;
  case_pack?: number;
  category_id?: number;
  category?: Category;
  created_at: string;
}

export default function EditProductPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    checkAdminAccess();
    fetchCategories();
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

  const fetchProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('Products')
        .select(`
          *,
          category:categories(*)
        `)
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
        visible_to_americas: data.visible_to_americas ?? true,
        visible_to_international: data.visible_to_international ?? true,
        qualifies_for_credit_earning: data.qualifies_for_credit_earning ?? true,
        picture_url: data.picture_url || '',
        case_weight: data.case_weight?.toString() || '',
        hs_code: data.hs_code || '',
        made_in: data.made_in || '',
        category_id: data.category_id?.toString() || ''
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
          visible_to_americas: formData.visible_to_americas,
          visible_to_international: formData.visible_to_international,
          qualifies_for_credit_earning: formData.qualifies_for_credit_earning,
          picture_url: formData.picture_url || null,
        case_weight: formData.case_weight ? parseFloat(formData.case_weight) : null,
        hs_code: formData.hs_code || null,
        made_in: formData.made_in || null,
        category_id: formData.category_id || null
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading product...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <InnerPageShell
        title="Edit Product"
        breadcrumbs={[{ label: 'Products', href: '/admin/products' }, { label: 'Edit' }]}
        actions={<Link href={`/admin/products/${params.id}`} className="text-gray-600 hover:text-gray-800">← Back to Product</Link>}
      >
        <div className="max-w-4xl mx-auto">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
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
      </InnerPageShell>
    </AdminLayout>
  );
}
