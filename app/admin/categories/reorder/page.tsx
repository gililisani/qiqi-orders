'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import AdminLayout from '../../../components/AdminLayout';
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

export default function ReorderCategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

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

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    const newCategories = [...categories];
    const draggedCategory = newCategories[draggedIndex];
    
    // Remove dragged item
    newCategories.splice(draggedIndex, 1);
    
    // Insert at new position
    newCategories.splice(dropIndex, 0, draggedCategory);
    
    // Update sort_order values
    const updatedCategories = newCategories.map((cat, index) => ({
      ...cat,
      sort_order: index + 1
    }));
    
    setCategories(updatedCategories);
    setDraggedIndex(null);
  };

  const handleSaveOrder = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Update each category's sort_order
      const updates = categories.map((category, index) => 
        supabase
          .from('categories')
          .update({ sort_order: index + 1 })
          .eq('id', category.id)
      );

      const results = await Promise.all(updates);
      
      // Check for any errors
      const hasError = results.some(result => result.error);
      if (hasError) {
        throw new Error('Failed to update some categories');
      }

      setSuccess('Category order updated successfully!');
      
      // Refresh the data to confirm changes
      await fetchCategories();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    fetchCategories();
    setError('');
    setSuccess('');
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
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reorder Categories</h1>
            <p className="text-gray-600 mt-1">Drag and drop categories to change their display order in order forms</p>
          </div>
          <Link
            href="/admin/categories"
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Categories
          </Link>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {success}
          </div>
        )}

        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Category Display Order</h2>
            <p className="text-sm text-gray-600 mt-1">
              Drag and drop the categories below to reorder them. The order here will be reflected in the order forms.
            </p>
          </div>

          <div className="p-6">
            {categories.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No categories found.</p>
                <Link
                  href="/admin/categories/new"
                  className="text-blue-600 hover:text-blue-800 mt-2 inline-block"
                >
                  Create your first category
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {categories.map((category, index) => (
                  <div
                    key={category.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, index)}
                    className={`
                      flex items-center justify-between p-4 border-2 rounded-lg cursor-move transition-all
                      ${draggedIndex === index 
                        ? 'border-blue-500 bg-blue-50 shadow-lg transform rotate-1' 
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                      }
                    `}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-medium text-sm">
                            {index + 1}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900">
                          {category.name}
                        </h3>
                        {category.description && (
                          <p className="text-sm text-gray-500 mt-1">{category.description}</p>
                        )}
                        <div className="flex items-center mt-2 space-x-4">
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                            {category.product_count} products
                          </span>
                          <div className="flex items-center space-x-2">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              category.visible_to_americas 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              Americas: {category.visible_to_americas ? 'Visible' : 'Hidden'}
                            </span>
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              category.visible_to_international 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              International: {category.visible_to_international ? 'Visible' : 'Hidden'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-gray-400">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {categories.length > 0 && (
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={handleReset}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition"
                >
                  Reset Changes
                </button>
                <button
                  onClick={handleSaveOrder}
                  disabled={saving}
                  className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Order'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 mb-2">How it works:</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Drag and drop categories to reorder them</li>
            <li>• The order here determines how categories appear in order forms</li>
            <li>• Categories with lower numbers appear first</li>
            <li>• Changes are saved to the database when you click "Save Order"</li>
            <li>• Products without categories always appear at the bottom</li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
}
