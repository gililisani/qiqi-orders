'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';



interface Product {
  id: number;
  item_name: string;
  picture_url?: string;
  category?: {
    name: string;
  };
}

interface HighlightedProduct {
  id: string;
  product_id: number;
  is_new: boolean;
  display_order: number;
  product: Product;
}

export default function HighlightedProductsManager() {
  const [highlightedProducts, setHighlightedProducts] = useState<HighlightedProduct[]>([]);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showProductSelector, setShowProductSelector] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch highlighted products with product details
      const { data: highlightedData, error: highlightedError } = await supabase
        .from('highlighted_products')
        .select(`
          *,
          product:"Products"(
            id,
            item_name,
            picture_url,
            category:categories(name)
          )
        `)
        .order('display_order', { ascending: true });

      if (highlightedError) throw highlightedError;

      // Fetch all products for selection
      const { data: productsData, error: productsError } = await supabase
        .from('Products')
        .select(`
          id,
          item_name,
          picture_url,
          category:categories(name)
        `)
        .order('item_name', { ascending: true });

      if (productsError) throw productsError;

      setHighlightedProducts(highlightedData || []);
      
      // Filter out already highlighted products and transform data
      const highlightedProductIds = (highlightedData || []).map(hp => hp.product_id);
      const availableProducts = (productsData || [])
        .filter(p => !highlightedProductIds.includes(p.id))
        .map(p => ({
          ...p,
          category: Array.isArray(p.category) ? p.category[0] : p.category
        }));
      setAvailableProducts(availableProducts);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const addHighlightedProduct = async (productId: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const nextOrder = Math.max(...highlightedProducts.map(hp => hp.display_order), -1) + 1;

      const { error } = await supabase
        .from('highlighted_products')
        .insert({
          product_id: productId,
          display_order: nextOrder,
          created_by: user.id
        });

      if (error) throw error;
      
      setShowProductSelector(false);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const removeHighlightedProduct = async (id: string) => {
    try {
      const { error } = await supabase
        .from('highlighted_products')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleNewStatus = async (id: string, isNew: boolean) => {
    try {
      const { error } = await supabase
        .from('highlighted_products')
        .update({ is_new: !isNew })
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const moveProduct = async (id: string, direction: 'up' | 'down') => {
    try {
      const currentIndex = highlightedProducts.findIndex(hp => hp.id === id);
      if (currentIndex === -1) return;

      const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= highlightedProducts.length) return;

      const currentProduct = highlightedProducts[currentIndex];
      const targetProduct = highlightedProducts[newIndex];

      // Swap display orders
      await supabase
        .from('highlighted_products')
        .update({ display_order: targetProduct.display_order })
        .eq('id', currentProduct.id);

      await supabase
        .from('highlighted_products')
        .update({ display_order: currentProduct.display_order })
        .eq('id', targetProduct.id);

      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading highlighted products...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="p-6">
        <div className="space-y-6">
          <Card header={<h2 className="font-semibold">Highlighted Products Manager</h2>}>
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-4">
                Manage products that appear in the rotating banner on client dashboards. 
                Use the "NEW" toggle to highlight new product releases.
              </p>
              
              <button
                onClick={() => setShowProductSelector(true)}
                className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition flex items-center space-x-2"
              >
                <PlusIcon className="h-4 w-4" />
                <span>Add Product</span>
              </button>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            {highlightedProducts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No products highlighted yet. Click "Add Product" to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {highlightedProducts.map((highlightedProduct, index) => (
                  <div key={highlightedProduct.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="flex flex-col space-y-1">
                        <button
                          onClick={() => moveProduct(highlightedProduct.id, 'up')}
                          disabled={index === 0}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <ArrowUpIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => moveProduct(highlightedProduct.id, 'down')}
                          disabled={index === highlightedProducts.length - 1}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <ArrowDownIcon className="h-4 w-4" />
                        </button>
                      </div>
                      
                      {highlightedProduct.product?.picture_url && (
                        <img
                          src={highlightedProduct.product.picture_url}
                          alt={highlightedProduct.product.item_name}
                          className="w-16 h-16 object-cover rounded"
                        />
                      )}
                      
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {highlightedProduct.product?.item_name || 'Unknown Product'}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {highlightedProduct.product?.category?.name || 'No category'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={highlightedProduct.is_new}
                          onChange={() => toggleNewStatus(highlightedProduct.id, highlightedProduct.is_new)}
                          className="rounded border-gray-300 text-black focus:ring-black"
                        />
                        <span className="text-sm font-medium text-gray-700">NEW</span>
                      </label>
                      
                      <button
                        onClick={() => removeHighlightedProduct(highlightedProduct.id)}
                        className="text-red-600 hover:text-red-800 p-2"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Product Selector Modal */}
          {showProductSelector && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold">Select Product to Highlight</h3>
                    <button
                      onClick={() => setShowProductSelector(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {availableProducts.map((product) => (
                      <div
                        key={product.id}
                        onClick={() => addHighlightedProduct(product.id)}
                        className="p-4 border border-gray-200 rounded-lg hover:border-black cursor-pointer transition"
                      >
                        <div className="flex items-center space-x-3">
                          {product.picture_url && (
                            <img
                              src={product.picture_url}
                              alt={product.item_name}
                              className="w-12 h-12 object-cover rounded"
                            />
                          )}
                          <div>
                            <h4 className="font-medium text-gray-900">{product.item_name}</h4>
                            <p className="text-sm text-gray-500">
                              {product.category?.name || 'No category'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {availableProducts.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p>All products are already highlighted.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
    </>
  );
}
