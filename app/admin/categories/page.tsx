'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';

interface Category {
  id: number;
  name: string;
  description?: string;
  sort_order: number;
  visible_to_americas: boolean;
  visible_to_international: boolean;
  product_count?: number;
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select(`
          *,
          product_count:Products(count)
        `)
        .order('sort_order');

      if (error) throw error;
      
      // Transform the data to get product counts
      const categoriesWithCounts = data?.map(cat => ({
        ...cat,
        product_count: cat.product_count?.[0]?.count || 0
      })) || [];
      
      setCategories(categoriesWithCounts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete the category "${name}"? This will remove the category from all products.`)) {
      return;
    }

    try {
      // First, remove category from all products
      const { error: updateError } = await supabase
        .from('Products')
        .update({ category_id: null })
        .eq('category_id', id);

      if (updateError) throw updateError;

      // Then delete the category
      const { error: deleteError } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      fetchCategories();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex justify-center items-center min-h-64">
          <div className="text-lg">Loading categories...</div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Product Categories</h1>
            <p className="text-gray-600 mt-1">Manage product categories and their visibility settings</p>
          </div>
          <Link
            href="/admin/categories/new"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Add Category
          </Link>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {categories.map((category) => (
              <li key={category.id}>
                <div className="px-4 py-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-medium text-sm">
                            {category.sort_order}
                          </span>
                        </div>
                      </div>
                      <div className="ml-4 flex-1">
                        <div className="flex items-center">
                          <h3 className="text-lg font-medium text-gray-900">
                            {category.name}
                          </h3>
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {category.product_count} products
                          </span>
                        </div>
                        {category.description && (
                          <p className="text-sm text-gray-500 mt-1">{category.description}</p>
                        )}
                        <div className="flex items-center mt-2 space-x-4">
                          <div className="flex items-center">
                            <span className="text-xs text-gray-500 mr-2">Americas:</span>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              category.visible_to_americas 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {category.visible_to_americas ? 'Visible' : 'Hidden'}
                            </span>
                          </div>
                          <div className="flex items-center">
                            <span className="text-xs text-gray-500 mr-2">International:</span>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              category.visible_to_international 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {category.visible_to_international ? 'Visible' : 'Hidden'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Link
                      href={`/admin/categories/${category.id}/edit`}
                      className="text-blue-600 hover:text-blue-900 text-sm"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(category.id, category.name)}
                      className="text-red-600 hover:text-red-900 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {categories.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No categories found.</p>
            <Link
              href="/admin/categories/new"
              className="text-blue-600 hover:text-blue-800 mt-2 inline-block"
            >
              Create your first category
            </Link>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
