'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import ClientLayout from '../../../components/ClientLayout';
import Link from 'next/link';
import Image from 'next/image';

interface Product {
  id: number;
  item_name: string;
  sku: string;
  upc: string;
  size: string;
  case_pack: number;
  price_international: number;
  price_americas: number;
  picture_url?: string;
  list_in_support_funds: boolean;
  visible_to_americas: boolean;
  visible_to_international: boolean;
}

interface Company {
  id: string;
  company_name: string;
  netsuite_number: string;
  support_fund?: { percent: number }[];
  class?: { name: string }[];
}

interface OrderItem {
  product_id: number;
  product: Product;
  case_qty: number;
  total_units: number;
  unit_price: number;
  total_price: number;
}

export default function NewOrderPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const getClientType = () => {
    if (!company?.class?.[0]?.name) return 'Americas';
    
    const className = company.class[0].name.toLowerCase();
    return className.includes('international') ? 'International' : 'Americas';
  };

  const getProductPrice = (product: Product) => {
    if (!company?.class?.[0]?.name) return product.price_americas;
    
    const className = company.class[0].name.toLowerCase();
    if (className.includes('international')) {
      return product.price_international;
    }
    return product.price_americas;
  };

  useEffect(() => {
    fetchCompanyData();
  }, []);

  useEffect(() => {
    if (company) {
      fetchProducts();
    }
  }, [company]);

  const fetchCompanyData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      // Get user's company info
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select(`
          company_id,
          company:companies(
            id,
            company_name,
            netsuite_number,
            support_fund:support_fund_levels(percent),
            class:classes(name)
          )
        `)
        .eq('id', user.id)
        .single();

      if (clientError) throw clientError;
      setCompany(clientData?.company?.[0] || null);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      // Get products visible to this client's class
      const clientClass = getClientType();
      const isInternational = clientClass.toLowerCase().includes('international');
      
      let productsQuery = supabase
        .from('Products')
        .select('*')
        .eq('enable', true);
      
      // Filter by class visibility
      if (isInternational) {
        productsQuery = productsQuery.eq('visible_to_international', true);
      } else {
        productsQuery = productsQuery.eq('visible_to_americas', true);
      }
      
      const { data: productsData, error: productsError } = await productsQuery
        .order('item_name', { ascending: true });

      if (productsError) throw productsError;
      setProducts(productsData || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCaseQtyChange = (productId: number, caseQty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const unitPrice = getProductPrice(product);
    const totalUnits = caseQty * product.case_pack;
    const totalPrice = unitPrice * totalUnits;

    setOrderItems(prev => {
      const existingIndex = prev.findIndex(item => item.product_id === productId);
      
      if (caseQty === 0) {
        // Remove item if case qty is 0
        return prev.filter(item => item.product_id !== productId);
      }

      const newItem: OrderItem = {
        product_id: productId,
        product,
        case_qty: caseQty,
        total_units: totalUnits,
        unit_price: unitPrice,
        total_price: totalPrice
      };

      if (existingIndex >= 0) {
        // Update existing item
        const updated = [...prev];
        updated[existingIndex] = newItem;
        return updated;
      } else {
        // Add new item
        return [...prev, newItem];
      }
    });
  };

  const getOrderTotals = () => {
    const subtotal = orderItems.reduce((sum, item) => sum + item.total_price, 0);
    const supportFundPercent = company?.support_fund?.[0]?.percent || 0;
    const supportFundEarned = subtotal * (supportFundPercent / 100);
    const total = subtotal;

    return {
      subtotal,
      supportFundPercent,
      supportFundEarned,
      total,
      itemCount: orderItems.length
    };
  };

  const handleSubmit = async () => {
    if (orderItems.length === 0) {
      setError('Please add at least one product to your order.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const totals = getOrderTotals();

      // Create the order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert([{
          user_id: user.id,
          company_id: company?.id,
          status: 'Open',
          total_value: totals.total,
          support_fund_used: 0 // Will be calculated in support fund redemption step
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItemsData = orderItems.map(item => ({
        order_id: orderData.id,
        product_id: item.product_id,
        quantity: item.total_units,
        unit_price: item.unit_price,
        total_price: item.total_price
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemsData);

      if (itemsError) throw itemsError;

      // Redirect to support fund redemption if applicable
      if (totals.supportFundEarned > 0) {
        router.push(`/client/orders/${orderData.id}/support-fund`);
      } else {
        router.push(`/client/orders/${orderData.id}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading products...</p>
        </div>
      </ClientLayout>
    );
  }

  if (error && !company) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link
            href="/client"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Back to Dashboard
          </Link>
        </div>
      </ClientLayout>
    );
  }

  const totals = getOrderTotals();

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">New Order</h1>
          <Link
            href="/client/orders"
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Orders
          </Link>
        </div>

        {/* Company Info */}
        {company && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Order Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Company</label>
                <p className="text-lg">{company.company_name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Client Type</label>
                <p className="text-lg">{getClientType()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Support Fund</label>
                <p className="text-lg">{totals.supportFundPercent}%</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Products Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    UPC
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Size
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Case Pack
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Price/Unit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Case Qty
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Units
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total USD
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {products.map((product) => {
                  const orderItem = orderItems.find(item => item.product_id === product.id);
                  const unitPrice = getProductPrice(product);
                  
                  return (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-12 w-12">
                            {product.picture_url ? (
                              <Image
                                src={product.picture_url}
                                alt={product.item_name}
                                width={48}
                                height={48}
                                className="h-12 w-12 rounded object-cover"
                              />
                            ) : (
                              <div className="h-12 w-12 bg-gray-200 rounded flex items-center justify-center">
                                <span className="text-gray-400 text-xs">No Image</span>
                              </div>
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {product.item_name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {product.sku}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {product.upc}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {product.size}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {product.case_pack}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${unitPrice.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="number"
                          min="0"
                          value={orderItem?.case_qty || 0}
                          onChange={(e) => handleCaseQtyChange(product.id, parseInt(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {orderItem?.total_units || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        ${orderItem?.total_price?.toFixed(2) || '0.00'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Order Summary */}
        {orderItems.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Items in Order:</span>
                <span className="font-medium">{totals.itemCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">${totals.subtotal.toFixed(2)}</span>
              </div>
              {totals.supportFundEarned > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Support Fund Earned ({totals.supportFundPercent}%):</span>
                  <span className="font-medium">${totals.supportFundEarned.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t pt-2">
                <div className="flex justify-between">
                  <span className="text-lg font-semibold">Total:</span>
                  <span className="text-lg font-semibold">${totals.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4">
          <Link
            href="/client/orders"
            className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition"
          >
            Cancel
          </Link>
          <button
            onClick={handleSubmit}
            disabled={submitting || orderItems.length === 0}
            className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? 'Creating Order...' : 'Create Order'}
          </button>
        </div>
      </div>
    </ClientLayout>
  );
}
