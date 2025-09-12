'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import ClientLayout from '../../../components/ClientLayout';
import Link from 'next/link';

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_value: number;
  support_fund_used: number;
  company?: {
    company_name: string;
    netsuite_number: string;
    support_fund?: { percent: number }[];
  };
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product?: {
    item_name: string;
    sku: string;
    price_international: number;
    price_americas: number;
  };
}

const statusColors = {
  'Open': 'bg-yellow-100 text-yellow-800',
  'In Process': 'bg-blue-100 text-blue-800',
  'Done': 'bg-green-100 text-green-800',
  'Cancelled': 'bg-red-100 text-red-800'
};

export default function ClientOrderViewPage() {
  const params = useParams();
  const orderId = params.id as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (orderId) {
      fetchOrder();
      fetchOrderItems();
    }
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          company:companies(
            company_name,
            netsuite_number,
            support_fund:support_fund_levels(percent)
          )
        `)
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setOrder(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderItems = async () => {
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          *,
          product:Products(item_name, sku, price_international, price_americas)
        `)
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setOrderItems(data || []);
    } catch (err: any) {
      console.error('Error fetching order items:', err);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading order...</p>
        </div>
      </ClientLayout>
    );
  }

  if (error || !order) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Order Not Found</h1>
          <p className="text-gray-600 mb-4">{error || 'The order you are looking for does not exist.'}</p>
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

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Order Details</h1>
          <Link
            href="/client/orders"
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Orders
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Order Information */}
          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-4">Order Information</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Order ID</label>
                <p className="text-lg font-mono">{order.id}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Status</label>
                <div className="mt-1">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    statusColors[order.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800'
                  }`}>
                    {order.status}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Total Value</label>
                <p className="text-lg font-semibold">${order.total_value?.toFixed(2) || '0.00'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Support Fund Used</label>
                <p className="text-lg font-semibold text-green-600">${order.support_fund_used?.toFixed(2) || '0.00'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Created</label>
                <p className="text-lg">{new Date(order.created_at).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Company Information */}
          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-4">Company Information</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Company</label>
                <p className="text-lg">{order.company?.company_name || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">NetSuite Number</label>
                <p className="text-lg">{order.company?.netsuite_number || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Support Fund %</label>
                <p className="text-lg">{order.company?.support_fund?.[0]?.percent || 0}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="bg-white rounded-lg shadow border overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Order Items</h2>
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
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Price
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orderItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {item.product?.item_name || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.product?.sku || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${item.unit_price?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      ${item.total_price?.toFixed(2) || '0.00'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {orderItems.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>No items found for this order.</p>
            </div>
          )}
        </div>

        {/* Order Summary */}
        <div className="bg-white rounded-lg shadow border p-6">
          <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium">${(order.total_value - (order.support_fund_used || 0)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Support Fund Used:</span>
              <span className="font-medium text-green-600">-${order.support_fund_used?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="border-t pt-2">
              <div className="flex justify-between">
                <span className="text-lg font-semibold">Total:</span>
                <span className="text-lg font-semibold">${order.total_value?.toFixed(2) || '0.00'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
