'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';
import {
  Card,
  CardBody,
  CardHeader,
  Typography,
  Button,
  Chip,
  Breadcrumbs,
} from '../../components/MaterialTailwind';

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
        {/* Breadcrumbs */}
        <Breadcrumbs>
          <Link href="/admin" className="opacity-60">
            Admin
          </Link>
          <span>Categories</span>
        </Breadcrumbs>

        <div className="flex justify-between items-center">
          <Typography variant="h4" color="blue-gray" className="font-bold">
            Product Categories
          </Typography>
          <div className="flex space-x-3">
            <Link href="/admin/categories/reorder">
              <Button variant="outlined" size="sm">
                Reorder Categories
              </Button>
            </Link>
            <Link href="/admin/categories/new">
              <Button variant="filled" size="sm">
                Add Category
              </Button>
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Material Tailwind Table */}
        <Card className="border border-blue-gray-100 shadow-sm">
          <CardHeader floated={false} shadow={false} className="rounded-none">
            <div className="flex items-center justify-between">
              <Typography variant="h5" color="blue-gray">
                Categories Management
              </Typography>
            </div>
          </CardHeader>
          <CardBody className="overflow-x-scroll px-0 pt-0 pb-2">
            <table className="w-full min-w-[640px] table-auto">
              <thead>
                <tr>
                  {["Order", "Category", "Products", "Americas", "International", "Actions"].map((el) => (
                    <th
                      key={el}
                      className="border-b border-blue-gray-50 py-3 px-5 text-left"
                    >
                      <Typography
                        variant="small"
                        className="text-[11px] font-bold uppercase text-blue-gray-400"
                      >
                        {el}
                      </Typography>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((category, index) => {
                  const className = `py-3 px-5 ${
                    index === categories.length - 1
                      ? ""
                      : "border-b border-blue-gray-50"
                  }`;
                  
                  return (
                    <tr key={category.id}>
                      <td className={className}>
                        <Typography className="text-xs font-semibold text-blue-gray-600">
                          {category.sort_order}
                        </Typography>
                      </td>
                      <td className={className}>
                        <div>
                          <Typography
                            variant="small"
                            color="blue-gray"
                            className="font-semibold"
                          >
                            {category.name}
                          </Typography>
                          {category.description && (
                            <Typography className="text-xs font-normal text-blue-gray-500">
                              {category.description}
                            </Typography>
                          )}
                        </div>
                      </td>
                      <td className={className}>
                        <Chip
                          variant="ghost"
                          color="blue-gray"
                          value={`${category.product_count || 0} products`}
                          className="py-0.5 px-2 text-[11px] font-medium w-fit"
                        />
                      </td>
                      <td className={className}>
                        <Chip
                          variant="gradient"
                          color={category.visible_to_americas ? "green" : "red"}
                          value={category.visible_to_americas ? "Visible" : "Hidden"}
                          className="py-0.5 px-2 text-[11px] font-medium w-fit"
                        />
                      </td>
                      <td className={className}>
                        <Chip
                          variant="gradient"
                          color={category.visible_to_international ? "green" : "red"}
                          value={category.visible_to_international ? "Visible" : "Hidden"}
                          className="py-0.5 px-2 text-[11px] font-medium w-fit"
                        />
                      </td>
                      <td className={className}>
                        <div className="flex items-center gap-3">
                          <Link href={`/admin/categories/${category.id}/edit`}>
                            <Typography
                              as="a"
                              className="text-xs font-semibold text-blue-gray-600 cursor-pointer hover:text-blue-500"
                            >
                              Edit
                            </Typography>
                          </Link>
                          <Typography
                            as="button"
                            onClick={() => handleDelete(category.id, category.name)}
                            className="text-xs font-semibold text-red-600 cursor-pointer hover:text-red-500"
                          >
                            Delete
                          </Typography>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>

        {categories.length === 0 && (
          <div className="py-12 text-center">
            <Typography variant="h6" color="blue-gray" className="mb-2">
              No categories found
            </Typography>
            <Typography variant="small" color="gray">
              Categories will help organize your products.
            </Typography>
            <Link href="/admin/categories/new" className="mt-4 inline-block">
              <Button variant="filled" size="sm">
                Create your first category
              </Button>
            </Link>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
