'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';


import Link from 'next/link';
import CategoryImageUpload from '../../../components/CategoryImageUpload';

export default function NewCategoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sort_order: '',
    visible_to_americas: true,
    visible_to_international: true,
    image_url: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase
        .from('categories')
        .insert([{
          name: formData.name,
          description: formData.description || null,
          sort_order: formData.sort_order ? parseInt(formData.sort_order) : 0,
          visible_to_americas: formData.visible_to_americas,
          visible_to_international: formData.visible_to_international,
          image_url: formData.image_url || null
        }]);

      if (error) throw error;

      router.push('/admin/categories');
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
    <>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Add New Category</h1>
            <p className="text-gray-600 mt-1">Create a new product category</p>
          </div>
          <div className="flex space-x-3">
            <Link
              href="/admin/categories/reorder"
              className="bg-blue-600 text-white px-3 py-2 rounded hover:opacity-90 transition text-sm"
            >
              Reorder Categories
            </Link>
            <Link
              href="/admin/categories"
              className="text-gray-600 hover:text-gray-800"
            >
              ← Back to Categories
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white shadow rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="e.g., ProCtrl, SelfCtrl, KITS"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                placeholder="Optional description of this category"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sort Order
                </label>
                <input
                  type="number"
                  name="sort_order"
                  value={formData.sort_order}
                  onChange={handleChange}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
                <p className="text-xs text-gray-500 mt-1">Lower numbers appear first (0 = first position)</p>
              </div>

              <div>
                <CategoryImageUpload
                  onImageUploaded={(url) => setFormData(prev => ({ ...prev, image_url: url }))}
                  currentImageUrl={formData.image_url}
                />
              </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Visibility Settings</h3>
              <p className="text-sm text-gray-600">Control which client classes can see this category</p>
              
              <div className="space-y-3">
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

            <div className="flex justify-end space-x-3">
              <Link
                href="/admin/categories"
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Category'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
