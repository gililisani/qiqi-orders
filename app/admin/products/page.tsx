'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';

interface Product {
  id: number;
  item_name: string;
  sku: string;
  price_international: number;
  price_americas: number;
  enable: boolean;
  list_in_support_funds: boolean;
  picture_url?: string;
  netsuite_name?: string;
  upc?: string;
  size?: string;
  case_pack?: number;
  sort_order?: number;
  created_at: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
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
      const { data, error } = await supabase
        .from('Products')
        .select('*')
        .order('item_name', { ascending: true });

      if (error) throw error;
      setProducts(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
              Drag and drop products to reorder them. The order will be reflected in the Order Form.
            </p>
          </div>
          <ul className="divide-y divide-gray-200">
            {filteredProducts.map((product, index) => (
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
                  <div className="flex items-center space-x-2">
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

        {filteredProducts.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">
              {searchTerm ? 'No products found matching your search.' : 'No products found.'}
            </p>
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
