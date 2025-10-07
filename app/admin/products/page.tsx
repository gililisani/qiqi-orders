'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Card from '../../components/ui/Card';
import Link from 'next/link';

interface Category {
  id: number;
  name: string;
  sort_order: number;
  image_url?: string;
}

interface Product {
  id: number;
  item_name: string;
  sku: string;
  price_international: number;
  price_americas: number;
  enable: boolean;
  list_in_support_funds: boolean;
  qualifies_for_credit_earning: boolean;
  picture_url?: string;
  netsuite_name?: string;
  upc?: string;
  size?: string;
  case_pack?: number;
  sort_order?: number;
  category_id?: number;
  category?: Category;
  created_at: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      // Fetch categories first
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true });

      if (categoriesError) throw categoriesError;
      setCategories(categoriesData || []);

      // Fetch products with categories
      const { data, error } = await supabase
        .from('Products')
        .select(`
          *,
          category:categories(*)
        `)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('item_name', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = async (productId: number, categoryId: number | null) => {
    try {
      const { error } = await supabase
        .from('Products')
        .update({ category_id: categoryId })
        .eq('id', productId);

      if (error) throw error;

      // Update local state
      setProducts(prev => prev.map(product => 
        product.id === productId 
          ? { 
              ...product, 
              category_id: categoryId || undefined,
              category: categoryId ? categories.find(cat => cat.id === categoryId) : undefined
            }
          : product
      ));
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Group products by categories for display
  const getProductsByCategory = () => {
    const categorized: { [key: string]: { category: Category | null, products: Product[] } } = {};
    
    // Group products by their categories
    products.forEach(product => {
      if (product.category) {
        const categoryKey = `${product.category.sort_order}-${product.category.name}`;
        if (!categorized[categoryKey]) {
          categorized[categoryKey] = {
            category: product.category,
            products: []
          };
        }
        categorized[categoryKey].products.push(product);
      }
    });
    
    // Add products without categories to "No Category"
    const orphanedProducts = products.filter(product => !product.category);
    if (orphanedProducts.length > 0) {
      categorized['999-No Category'] = {
        category: null,
        products: orphanedProducts
      };
    }
    
    // Sort categories by sort_order (999 for "No Category" will be last)
    return Object.entries(categorized)
      .sort(([keyA], [keyB]) => {
        const orderA = parseInt(keyA.split('-')[0]);
        const orderB = parseInt(keyB.split('-')[0]);
        return orderA - orderB;
      })
      .map(([, data]) => data);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      const { error } = await supabase
        .from('Products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchProducts(); // Refresh the list
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDragStart = (e: React.DragEvent, productId: number) => {
    setDraggedItem(productId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetProductId: number) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem === targetProductId) {
      setDraggedItem(null);
      return;
    }

    setIsReordering(true);
    
    try {
      // Find the dragged and target products
      const draggedProduct = products.find(p => p.id === draggedItem);
      const targetProduct = products.find(p => p.id === targetProductId);
      
      if (!draggedProduct || !targetProduct) return;

      // Create new array with reordered products
      const newProducts = [...products];
      const draggedIndex = newProducts.findIndex(p => p.id === draggedItem);
      const targetIndex = newProducts.findIndex(p => p.id === targetProductId);
      
      // Remove dragged item and insert at target position
      const [movedProduct] = newProducts.splice(draggedIndex, 1);
      newProducts.splice(targetIndex, 0, movedProduct);
      
      // Update sort_order values
      const updatedProducts = newProducts.map((product, index) => ({
        ...product,
        sort_order: index + 1
      }));
      
      setProducts(updatedProducts);
      
      // Update database
      const updates = updatedProducts.map(product => ({
        id: product.id,
        sort_order: product.sort_order
      }));
      
      const { error } = await supabase
        .from('Products')
        .upsert(updates, { onConflict: 'id' });
        
      if (error) throw error;
      
    } catch (err: any) {
      setError(err.message);
      // Revert on error
      fetchProducts();
    } finally {
      setDraggedItem(null);
      setIsReordering(false);
    }
  };

  const filteredProducts = products.filter(product =>
    product.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading products...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Products Management</h1>
          <div className="space-x-2">
            <Link
              href="/admin/products/bulk-upload"
              className="bg-blue-500 text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Bulk Upload
            </Link>
            <Link
              href="/admin/products/new"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Add New Product
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div>
          <input
            type="text"
            placeholder="Search products by name or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        {/* Group by Category with Form Kit tables per category */}
        {(() => {
          const categorizedProducts = getProductsByCategory();
          const filteredCategorizedProducts = categorizedProducts.map(categoryGroup => ({
            ...categoryGroup,
            products: categoryGroup.products.filter(product =>
              product.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              product.sku?.toLowerCase().includes(searchTerm.toLowerCase())
            )
          })).filter(categoryGroup => categoryGroup.products.length > 0);

          return filteredCategorizedProducts.map((categoryGroup) => (
            <Card
              key={categoryGroup.category?.id || 'no-category'}
              header={
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {categoryGroup.category?.image_url ? (
                      <img src={categoryGroup.category.image_url} alt={categoryGroup.category.name} className="h-8 w-auto" />
                    ) : (
                      <h3 className="text-base font-semibold text-gray-900">{categoryGroup.category?.name || 'Products without Category'}</h3>
                    )}
                  </div>
                  {categoryGroup.category && (
                    <Link href={`/admin/categories/${categoryGroup.category.id}/edit`} className="text-sm text-blue-600 hover:text-blue-800">Edit Category</Link>
                  )}
                </div>
              }
            >
              <div className="overflow-x-auto">
                <table className="w-full table-fixed border border-[#e5e5e5] rounded-lg overflow-hidden">
                  <thead>
                    <tr className="border-b border-[#e5e5e5]">
                      <th className="w-16 px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Image</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">SKU</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Americas</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">International</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Assign</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryGroup.products.map((product, index) => (
                      <tr key={product.id} className={`hover:bg-gray-50 border-b border-[#e5e5e5] ${draggedItem === product.id ? 'opacity-50' : ''}`}
                          draggable
                          onDragStart={(e) => handleDragStart(e, product.id)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, product.id)}
                      >
                        <td className="px-4 py-3 whitespace-nowrap w-16">
                          {product.picture_url ? (
                            <img src={product.picture_url} alt={product.item_name} className="h-12 w-12 rounded object-cover border border-[#e5e5e5]" />
                          ) : (
                            <div className="h-12 w-12 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">No Image</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-gray-400 font-mono shrink-0 w-8">{product.sort_order || index + 1}</span>
                            <span className="font-medium truncate max-w-[180px]">{product.item_name || 'Unnamed Product'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 break-all max-w-[120px]">{product.sku}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">${product.price_americas || 0}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">${product.price_international || 0}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${product.enable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{product.enable ? 'Enabled' : 'Disabled'}</span>
                            <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${product.list_in_support_funds ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>{product.list_in_support_funds ? 'Support Funds' : 'No Support Funds'}</span>
                            <span className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${product.qualifies_for_credit_earning ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>{product.qualifies_for_credit_earning ? 'Earns Credit' : 'No Credit'}</span>
                          </div>
                        </td>
                        {/* Assign Category */}
                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            <select
                              value={product.category_id || ''}
                              onChange={(e) => handleCategoryChange(product.id, e.target.value ? parseInt(e.target.value) : null)}
                              className="text-sm border border-[#e5e5e5] rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-black"
                            >
                              <option value="">No Category</option>
                              {categories.map((category) => (
                                <option key={category.id} value={category.id}>{category.name}</option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-3">
                            <Link className="text-blue-600 hover:text-blue-800" href={`/admin/products/${product.id}`}>View</Link>
                            <Link className="text-green-600 hover:text-green-800" href={`/admin/products/${product.id}/edit`}>Edit</Link>
                            <button onClick={() => handleDelete(product.id)} className="text-red-600 hover:text-red-800">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ));
        })()}

        {products.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No products found.</p>
            <Link
              href="/admin/products/new"
              className="mt-4 inline-block bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Add Your First Product
            </Link>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
