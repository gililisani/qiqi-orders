'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
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
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
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

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search products by name or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <p className="text-sm text-gray-600">
              Products are organized by categories. Assign products to categories using the dropdown below each product.
            </p>
          </div>
          
          {(() => {
            const categorizedProducts = getProductsByCategory();
            const filteredCategorizedProducts = categorizedProducts.map(categoryGroup => ({
              ...categoryGroup,
              products: categoryGroup.products.filter(product =>
                product.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                product.sku?.toLowerCase().includes(searchTerm.toLowerCase())
              )
            })).filter(categoryGroup => categoryGroup.products.length > 0);

            return filteredCategorizedProducts.map((categoryGroup, categoryIndex) => (
              <div key={categoryGroup.category?.id || 'no-category'}>
                {/* Category Header */}
                <div className="border-b border-gray-300">
                  <div className="relative">
                    {categoryGroup.category?.image_url ? (
                      <div className="relative">
                        <img
                          src={categoryGroup.category.image_url}
                          alt={categoryGroup.category.name}
                          className="w-full max-h-[100px] object-contain bg-white"
                          style={{ maxHeight: '100px' }}
                          onError={(e) => {
                            // Fallback to text header if image fails to load
                            e.currentTarget.style.display = 'none';
                            const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = 'block';
                          }}
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 px-4 py-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-sm font-semibold text-white">
                                {categoryGroup.category.name}
                              </h3>
                              <p className="text-xs text-gray-200">
                                {categoryGroup.products.length} product{categoryGroup.products.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <Link
                              href={`/admin/categories/${categoryGroup.category.id}/edit`}
                              className="text-xs text-white hover:text-gray-200 bg-black bg-opacity-50 px-2 py-1 rounded"
                            >
                              Edit Category
                            </Link>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-100 px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {categoryGroup.category?.name || 'Products without Category'}
                          </h3>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-800">
                            {categoryGroup.products.length} product{categoryGroup.products.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {categoryGroup.category && (
                          <Link
                            href={`/admin/categories/${categoryGroup.category.id}/edit`}
                            className="text-sm text-gray-600 hover:text-gray-800"
                          >
                            Edit Category
                          </Link>
                        )}
                      </div>
                    )}
                    <div style={{display: 'none'}} className="bg-gray-100 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {categoryGroup.category?.name || 'Products without Category'}
                        </h3>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-800">
                          {categoryGroup.products.length} product{categoryGroup.products.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {categoryGroup.category && (
                        <Link
                          href={`/admin/categories/${categoryGroup.category.id}/edit`}
                          className="text-sm text-gray-600 hover:text-gray-800"
                        >
                          Edit Category
                        </Link>
                      )}
                    </div>
                  </div>
                </div>

                {/* Products in this category */}
                <ul className="divide-y divide-gray-200">
                  {categoryGroup.products.map((product, index) => (
                    <li 
                      key={product.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, product.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, product.id)}
                      className={`cursor-move transition-colors ${
                        draggedItem === product.id ? 'opacity-50' : ''
                      } ${isReordering ? 'pointer-events-none' : ''}`}
                    >
                      <div className="px-4 py-4 flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <div className="text-sm text-gray-400 font-mono w-8">
                              {product.sort_order || index + 1}
                            </div>
                            <div className="text-gray-400">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
                              </svg>
                            </div>
                          </div>
                          <div className="flex items-center space-x-4">
                          {product.picture_url ? (
                            <img
                              src={product.picture_url}
                              alt={product.item_name}
                              className="h-16 w-16 object-cover rounded"
                            />
                          ) : (
                            <div className="h-16 w-16 bg-gray-200 rounded flex items-center justify-center">
                              <span className="text-gray-400 text-xs">No Image</span>
                            </div>
                          )}
                          <div>
                            <h3 className="text-lg font-medium text-gray-900">
                              {product.item_name || 'Unnamed Product'}
                            </h3>
                            <p className="text-sm text-gray-500">SKU: {product.sku || 'N/A'}</p>
                            <div className="flex space-x-4 text-sm text-gray-500">
                              <span>Americas: ${product.price_americas || 0}</span>
                              <span>International: ${product.price_international || 0}</span>
                            </div>
                          </div>
                          </div>
                        </div>
                        
                        {/* Category Assignment Dropdown */}
                        <div className="flex items-center space-x-4">
                          <div className="flex flex-col items-end space-y-2">
                            <label className="text-xs font-medium text-gray-700">Category:</label>
                            <select
                              value={product.category_id || ''}
                              onChange={(e) => handleCategoryChange(product.id, e.target.value ? parseInt(e.target.value) : null)}
                              className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">No Category</option>
                              {categories.map(category => (
                                <option key={category.id} value={category.id}>
                                  {category.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          
                          <div className="flex flex-col space-y-1">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              product.enable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {product.enable ? 'Enabled' : 'Disabled'}
                            </span>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              product.list_in_support_funds ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {product.list_in_support_funds ? 'Support Funds' : 'No Support Funds'}
                            </span>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              product.qualifies_for_credit_earning ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                            }`}>
                              {product.qualifies_for_credit_earning ? 'Earns Credit' : 'No Credit'}
                            </span>
                          </div>
                          <div className="flex space-x-2">
                            <Link
                              href={`/admin/products/${product.id}`}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                            >
                              View
                            </Link>
                            <Link
                              href={`/admin/products/${product.id}/edit`}
                              className="text-green-600 hover:text-green-800 text-sm font-medium"
                            >
                              Edit
                            </Link>
                            <button
                              onClick={() => handleDelete(product.id)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ));
          })()}
        </div>

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
