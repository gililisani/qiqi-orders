'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import ClientLayout from '../../../../components/ClientLayout';
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

interface Order {
  id: string;
  total_value: number;
  support_fund_used: number;
  company?: {
    support_fund?: { percent: number }[];
    class?: { name: string }[];
  };
}

interface SupportFundItem {
  product_id: number;
  product: Product;
  case_qty: number;
  total_units: number;
  unit_price: number;
  total_price: number;
}

export default function SupportFundPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [supportFundProducts, setSupportFundProducts] = useState<Product[]>([]);
  const [supportFundItems, setSupportFundItems] = useState<SupportFundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const getClientType = () => {
    if (!order?.company?.class?.[0]?.name) return 'Americas';
    
    const className = order.company.class[0].name.toLowerCase();
    return className.includes('international') ? 'International' : 'Americas';
  };

  useEffect(() => {
    if (orderId) {
      fetchData();
    }
  }, [orderId]);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      // Get order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          company:companies(
            support_fund:support_fund_levels(percent),
            class:classes(name)
          )
        `)
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData);

      // Get products eligible for support fund redemption and visible to this client's class
      const clientClass = getClientType();
      const isInternational = clientClass.toLowerCase().includes('international');
      
      let productsQuery = supabase
        .from('Products')
        .select('*')
        .eq('enable', true)
        .eq('list_in_support_funds', true);
      
      // Filter by class visibility
      if (isInternational) {
        productsQuery = productsQuery.eq('visible_to_international', true);
      } else {
        productsQuery = productsQuery.eq('visible_to_americas', true);
      }
      
      const { data: productsData, error: productsError } = await productsQuery
        .order('item_name', { ascending: true });

      if (productsError) throw productsError;
      setSupportFundProducts(productsData || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getProductPrice = (product: Product) => {
    if (!order?.company?.class?.[0]?.name) return product.price_americas;
    
    const className = order.company.class[0].name.toLowerCase();
    if (className.includes('international')) {
      return product.price_international;
    }
    return product.price_americas;
  };

  const handleCaseQtyChange = (productId: number, caseQty: number) => {
    const product = supportFundProducts.find(p => p.id === productId);
    if (!product) return;

    const unitPrice = getProductPrice(product);
    const totalUnits = caseQty * product.case_pack;
    const totalPrice = unitPrice * totalUnits;

    setSupportFundItems(prev => {
      const existingIndex = prev.findIndex(item => item.product_id === productId);
      
      if (caseQty === 0) {
        return prev.filter(item => item.product_id !== productId);
      }

      const newItem: SupportFundItem = {
        product_id: productId,
        product,
        case_qty: caseQty,
        total_units: totalUnits,
        unit_price: unitPrice,
        total_price: totalPrice
      };

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = newItem;
        return updated;
      } else {
        return [...prev, newItem];
      }
    });
  };

  const getSupportFundTotals = () => {
    const supportFundPercent = order?.company?.support_fund?.[0]?.percent || 0;
    const supportFundEarned = (order?.total_value || 0) * (supportFundPercent / 100);
    const supportFundUsed = supportFundItems.reduce((sum, item) => sum + item.total_price, 0);
    const remainingSupportFund = supportFundEarned - supportFundUsed;
    const finalTotal = (order?.total_value || 0) - supportFundUsed;

    return {
      supportFundPercent,
      supportFundEarned,
      supportFundUsed,
      remainingSupportFund,
      finalTotal,
      itemCount: supportFundItems.length
    };
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      const totals = getSupportFundTotals();

      // Update order with support fund usage
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          support_fund_used: totals.supportFundUsed,
          total_value: totals.finalTotal
        })
        .eq('id', orderId);

      if (orderError) throw orderError;

      // Add support fund items to order_items if any
      if (supportFundItems.length > 0) {
        console.log('Adding support fund items to order:', orderId);
        console.log('Support fund items:', supportFundItems);
        
        const supportFundItemsData = supportFundItems.map(item => ({
          order_id: orderId,
          product_id: item.product_id,
          quantity: item.total_units,
          unit_price: item.unit_price,
          total_price: item.total_price,
          is_support_fund_item: true
        }));

        console.log('Support fund items data to insert:', supportFundItemsData);

        const { data: insertedItems, error: itemsError } = await supabase
          .from('order_items')
          .insert(supportFundItemsData)
          .select();

        if (itemsError) {
          console.error('Error inserting support fund items:', itemsError);
          throw itemsError;
        }
        
        console.log('Successfully inserted support fund items:', insertedItems);
      }

      // Send order confirmation notification for the completed order
      try {
        await fetch('/api/orders/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId: orderId,
            type: 'order_created',
            customMessage: supportFundItems.length > 0 ? 'Order completed with support fund redemption' : undefined
          }),
        });
      } catch (notificationError) {
        console.error('Failed to send order confirmation:', notificationError);
        // Don't fail the order creation for notification errors
      }

      router.push(`/client/orders/${orderId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    router.push(`/client/orders/${orderId}`);
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading support fund redemption...</p>
        </div>
      </ClientLayout>
    );
  }

  if (error || !order) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-4">{error || 'Order not found.'}</p>
          <Link
            href="/client/orders"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Back to Orders
          </Link>
        </div>
      </ClientLayout>
    );
  }

  const totals = getSupportFundTotals();

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Support Fund Redemption</h1>
          <Link
            href={`/client/orders/${orderId}`}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Order
          </Link>
        </div>

        {/* Support Fund Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Support Fund Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Support Fund %</label>
              <p className="text-lg">{totals.supportFundPercent}%</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Support Fund Earned</label>
              <p className="text-lg text-green-600">${totals.supportFundEarned.toFixed(2)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Remaining Support Fund</label>
              <p className={`text-lg ${totals.remainingSupportFund >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${totals.remainingSupportFund.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Support Fund Products Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Support Fund Eligible Products</h2>
            <p className="text-sm text-gray-600 mt-1">
              Select products to redeem your support fund credit. Any unused credit will be forfeited.
            </p>
          </div>
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
                {supportFundProducts.map((product) => {
                  const supportFundItem = supportFundItems.find(item => item.product_id === product.id);
                  const unitPrice = getProductPrice(product);
                  
                  return (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-12 w-12">
                            {product.picture_url ? (
                              <img
                                src={product.picture_url}
                                alt={product.item_name}
                                className="h-12 w-12 rounded object-cover"
                                onError={(e) => {
                                  console.error('Image failed to load:', product.picture_url);
                                  e.currentTarget.style.display = 'none';
                                  const noImageDiv = e.currentTarget.nextElementSibling as HTMLElement;
                                  if (noImageDiv) noImageDiv.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div 
                              className="h-12 w-12 bg-gray-200 rounded flex items-center justify-center"
                              style={{display: product.picture_url ? 'none' : 'flex'}}
                            >
                              <span className="text-gray-400 text-xs">No Image</span>
                            </div>
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
                          max={Math.floor(totals.remainingSupportFund / unitPrice / product.case_pack)}
                          value={supportFundItem?.case_qty || 0}
                          onChange={(e) => handleCaseQtyChange(product.id, parseInt(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {supportFundItem?.total_units || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        ${supportFundItem?.total_price?.toFixed(2) || '0.00'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Support Fund Summary */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Support Fund Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Original Order Total:</span>
              <span className="font-medium">${order.total_value.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>Support Fund Used:</span>
              <span className="font-medium">-${totals.supportFundUsed.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Remaining Support Fund:</span>
              <span className={`font-medium ${totals.remainingSupportFund >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${totals.remainingSupportFund.toFixed(2)}
              </span>
            </div>
            <div className="border-t pt-2">
              <div className="flex justify-between">
                <span className="text-lg font-semibold">Final Total:</span>
                <span className="text-lg font-semibold">${totals.finalTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end space-x-4">
          <button
            onClick={handleSkip}
            className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition"
          >
            Skip Support Fund
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || totals.remainingSupportFund < 0}
            className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? 'Processing...' : 'Complete Order'}
          </button>
        </div>
      </div>
    </ClientLayout>
  );
}
