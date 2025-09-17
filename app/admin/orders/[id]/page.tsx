'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import AdminLayout from '../../../components/AdminLayout';
import Link from 'next/link';

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_value: number;
  support_fund_used: number;
  user_id: string;
  company_id: string;
  client?: {
    name: string;
    email: string;
  };
  company?: {
    company_name: string;
    netsuite_number: string;
    support_fund?: { percent: number };
    subsidiary?: { name: string };
    class?: { name: string };
    location?: { location_name: string };
  };
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_support_fund_item?: boolean;
  product?: {
    item_name: string;
    sku: string;
    price_international: number;
    price_americas: number;
    qualifies_for_credit_earning?: boolean;
  };
}

interface OrderHistory {
  id: string;
  order_id: string;
  status_from: string | null;
  status_to: string;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_by_role: string | null;
  notes: string | null;
  netsuite_sync_status: string | null;
  created_at: string;
}

const statusOptions = [
  { value: 'Open', label: 'Open', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'In Process', label: 'In Process', color: 'bg-blue-100 text-blue-800' },
  { value: 'Done', label: 'Done', color: 'bg-green-100 text-green-800' },
  { value: 'Cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' }
];

export default function OrderViewPage() {
  const params = useParams();
  const orderId = params.id as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sendingNotification, setSendingNotification] = useState(false);

  useEffect(() => {
    if (orderId) {
      fetchOrder();
      fetchOrderItems();
      fetchOrderHistory();
    }
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      // Fetch order first
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      // Fetch related data separately
      const [clientResult, companyResult] = await Promise.all([
        supabase
          .from('clients')
          .select('name, email')
          .eq('id', orderData.user_id)
          .single(),
        orderData.company_id ? supabase
          .from('companies')
          .select(`
            company_name,
            netsuite_number,
            support_fund:support_fund_levels(percent),
            subsidiary:subsidiaries(name),
            class:classes(name),
            location:Locations(location_name)
          `)
          .eq('id', orderData.company_id)
          .single() : { data: null, error: null }
      ]);

      // Combine data
      const combinedOrder = {
        ...orderData,
        client: clientResult.data,
        company: companyResult.data
      };

      setOrder(combinedOrder);
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
          product:Products(item_name, sku, price_international, price_americas, qualifies_for_credit_earning)
        `)
        .eq('order_id', orderId)
        .order('is_support_fund_item', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      setOrderItems(data || []);
    } catch (err: any) {
      console.error('Error fetching order items:', err);
    }
  };

  const fetchOrderHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('order_history')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrderHistory(data || []);
    } catch (err: any) {
      console.error('Error fetching order history:', err);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!order) return;

    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;
      setOrder(prev => prev ? { ...prev, status: newStatus } : null);
      
      // Refresh order history to show the new status change
      fetchOrderHistory();
      
      // Send notification if status changed to certain states
      if (['In Process', 'Done'].includes(newStatus)) {
        await sendNotification('status_change');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const sendNotification = async (type: string, customMessage?: string) => {
    if (!order) return;
    
    setSendingNotification(true);
    try {
      const response = await fetch('/api/orders/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: order.id,
          type,
          customMessage
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Refresh history to show notification sent
        fetchOrderHistory();
      } else {
        console.error('Failed to send notification:', data.error);
      }
    } catch (err: any) {
      console.error('Error sending notification:', err);
    } finally {
      setSendingNotification(false);
    }
  };

  const handleDownloadCSV = async () => {
    try {
      // For now, we'll just show an alert. We'll implement actual CSV generation later
      alert(`CSV download for order ${orderId} will be implemented in the next step.`);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading order...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error || !order) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Order Not Found</h1>
            <p className="text-gray-600 mb-4">{error || 'The order you are looking for does not exist.'}</p>
            <Link
              href="/admin/orders"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Back to Orders
            </Link>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Order Details</h1>
          <div className="flex space-x-2">
            <button
              onClick={() => sendNotification('status_change', 'Order status updated by admin')}
              disabled={sendingNotification}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition disabled:opacity-50"
            >
              {sendingNotification ? 'Sending...' : 'Send Update'}
            </button>
            <button
              onClick={handleDownloadCSV}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
            >
              Download CSV
            </button>
            <Link
              href="/admin/orders"
              className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition"
            >
              Back to Orders
            </Link>
          </div>
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
                  <select
                    value={order.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    className={`px-3 py-1 rounded-full border-0 focus:ring-2 focus:ring-black ${
                      statusOptions.find(s => s.value === order.status)?.color || 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {statusOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Total Value</label>
                <p className="text-lg font-semibold">${order.total_value?.toFixed(2) || '0.00'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Credit Earned</label>
                <p className="text-lg font-semibold text-green-600">
                  ${(() => {
                    // Calculate credit earned from regular items that qualify
                    const regularItems = orderItems.filter(item => !item.is_support_fund_item);
                    const creditEarningItems = regularItems.filter(item => item.product?.qualifies_for_credit_earning !== false);
                    const creditEarningSubtotal = creditEarningItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
                    const supportFundPercent = order.company?.support_fund?.percent || 0;
                    const creditEarned = creditEarningSubtotal * (supportFundPercent / 100);
                    return creditEarned.toFixed(2);
                  })()}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Created</label>
                <p className="text-lg">{new Date(order.created_at).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Client Information */}
          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-4">Client Information</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Client Name</label>
                <p className="text-lg">{order.client?.name || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Email</label>
                <p className="text-lg">{order.client?.email || 'N/A'}</p>
              </div>
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
                <p className="text-lg">{order.company?.support_fund?.percent || 0}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="mt-6 bg-white rounded-lg shadow border overflow-hidden">
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
                  <tr key={item.id} className={`hover:bg-gray-50 ${item.is_support_fund_item ? 'bg-green-50' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-gray-900">
                          {item.product?.item_name || 'N/A'}
                        </div>
                        {item.is_support_fund_item && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Support Fund
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.product?.sku || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.quantity}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${item.is_support_fund_item ? 'text-green-700 font-medium' : 'text-gray-900'}`}>
                      ${item.unit_price?.toFixed(2) || '0.00'}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${item.is_support_fund_item ? 'text-green-700' : 'text-gray-900'}`}>
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

        {/* Order History */}
        <div className="mt-6 bg-white rounded-lg shadow border overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Order History & Activity</h2>
          </div>
          <div className="p-6">
            {orderHistory.length > 0 ? (
              <div className="space-y-4">
                {orderHistory.map((historyItem) => (
                  <div key={historyItem.id} className="flex items-start space-x-3 pb-4 border-b border-gray-100 last:border-b-0">
                    <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        {historyItem.status_from && historyItem.status_to ? (
                          <span className="text-sm font-medium text-gray-900">
                            Status changed from <span className="px-2 py-1 bg-gray-100 rounded text-xs">{historyItem.status_from}</span> to <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">{historyItem.status_to}</span>
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-gray-900">
                            {historyItem.notes || `Status set to ${historyItem.status_to}`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>{new Date(historyItem.created_at).toLocaleString()}</span>
                        {historyItem.changed_by_name && (
                          <span>by {historyItem.changed_by_name} ({historyItem.changed_by_role})</span>
                        )}
                        {historyItem.netsuite_sync_status && (
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded">
                            NetSuite: {historyItem.netsuite_sync_status}
                          </span>
                        )}
                      </div>
                      {historyItem.notes && historyItem.notes !== `Status set to ${historyItem.status_to}` && (
                        <div className="mt-1 text-sm text-gray-600 italic">
                          {historyItem.notes}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No history available for this order.</p>
              </div>
            )}
          </div>
        </div>

        {/* Order Summary for Admin */}
        <div className="mt-6 bg-white rounded-lg shadow border p-6">
          <h2 className="text-lg font-semibold mb-4">Order Financial Summary</h2>
          <div className="space-y-2">
            {(() => {
              // Calculate breakdown
              const regularItems = orderItems.filter(item => !item.is_support_fund_item);
              const supportFundItems = orderItems.filter(item => item.is_support_fund_item);
              const regularSubtotal = regularItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
              const supportFundItemsTotal = supportFundItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
              
              // Use database values instead of recalculating
              const creditUsed = order.support_fund_used || 0;
              const totalOrderValue = order.total_value || 0;
              
              // Only calculate the balance
              const balance = creditUsed - supportFundItemsTotal;
              
              return (
                <>
                  {/* Regular Items */}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Regular Items:</span>
                    <span className="font-medium">${regularSubtotal.toFixed(2)}</span>
                  </div>
                  
                  {/* Credit Used - always display */}
                  <div className="flex justify-between text-green-600">
                    <span>Credit Used:</span>
                    <span className="font-medium">${creditUsed.toFixed(2)}</span>
                  </div>
                  
                  {/* Balance - always display */}
                  <div className="flex justify-between text-orange-600">
                    <span>Balance:</span>
                    <span className="font-medium">${balance.toFixed(2)}</span>
                  </div>
                  
                  <div className="border-t pt-2">
                    <div className="flex justify-between">
                      <span className="text-lg font-semibold">Total Order Value:</span>
                      <span className="text-lg font-semibold">${totalOrderValue.toFixed(2)}</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
