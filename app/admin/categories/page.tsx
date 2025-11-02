'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import Link from 'next/link';
import Card from '../../components/ui/Card';

interface Category {
  id: number;
  name: string;
  description?: string;
  sort_order: number;
  visible_to_americas: boolean;
  visible_to_international: boolean;
  image_url?: string;
  product_count?: number;
}

export default function CategoriesPage() {
  const router = useRouter();
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
        .select('id,name,description,sort_order,visible_to_americas,visible_to_international,image_url')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      // Debug log to help diagnose empty results / RLS issues
      console.log('[Categories] fetched rows:', data?.length || 0, { error });

      setCategories(data || []);
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
      <div className="flex justify-center items-center min-h-64">
          <div className="text-lg">Loading categories...</div>
        </div>
    );
  }

  return (
    <div className="space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-gray-900">Product Categories</h1>
          <div className="flex gap-3">
            <Link href="/admin/categories/reorder" className="px-3 py-2 border border-[#e5e5e5] rounded text-sm hover:bg-gray-50">Reorder Categories</Link>
            <Link href="/admin/categories/new" className="px-3 py-2 bg-black text-white rounded text-sm hover:bg-gray-900">Add Category</Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <Card header={<h2 className="text-lg font-semibold">Categories Management</h2>}>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-[#e5e5e5] rounded-lg overflow-hidden">
              <thead>
                <tr className="border-b border-[#e5e5e5]">
                  {['Order','Image','Category','Products','Americas','International','Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr
                    key={category.id}
                    onClick={() => router.push(`/admin/categories/${category.id}/edit`)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors border-b border-[#e5e5e5]"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{category.sort_order}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {category.image_url ? (
                        <img
                          src={category.image_url}
                          alt={category.name}
                          className="h-12 w-12 rounded object-cover border border-[#e5e5e5]"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded border border-[#e5e5e5] flex items-center justify-center text-gray-400 text-xs">
                          No Image
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-800">{category.name}</span>
                        {category.description ? (
                          <span className="text-xs text-gray-500">{category.description}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{category.product_count ?? 0} products</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${category.visible_to_americas ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {category.visible_to_americas ? 'Visible' : 'Hidden'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${category.visible_to_international ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {category.visible_to_international ? 'Visible' : 'Hidden'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-3">
                        <Link
                          className="text-black hover:opacity-70 transition-opacity"
                          href={`/admin/categories/${category.id}/edit`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {categories.length === 0 && (
          <div className="py-12 text-center">
            <h3 className="text-base font-medium text-gray-900 mb-1">No categories found</h3>
            <p className="text-sm text-gray-500">Categories will help organize your products.</p>
            <Link href="/admin/categories/new" className="mt-4 inline-block px-3 py-2 bg-black text-white rounded text-sm hover:bg-gray-900">Create your first category</Link>
          </div>
        )}
      </div>
  );
}
