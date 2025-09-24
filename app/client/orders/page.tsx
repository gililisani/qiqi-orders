'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import ClientLayout from '../../components/ClientLayout';
import Card from '../../components/ui/Card';
import Link from 'next/link';

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_value: number;
  support_fund_used: number;
  credit_earned: number;
  po_number: string;
}

const statusColors = {
  'Open': 'bg-yellow-100 text-yellow-800',
  'In Process': 'bg-blue-100 text-blue-800',
  'Done': 'bg-green-100 text-green-800',
  'Cancelled': 'bg-red-100 text-red-800'
};

export default function ClientOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(order => 
    statusFilter === '' || order.status === statusFilter
  );

  if (loading) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading orders...</p>
        </div>
      </ClientLayout>
    );
  }

  if (error) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Retry
          </button>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
          <Link
            href="/client/orders/new"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            New Order
          </Link>
        </div>
        <Card header={<h2 className="font-semibold">Filter Orders</h2>}>
          <div className="flex items-center justify-between pb-4">
            <div></div>
            <div className="flex items-center gap-4">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="">All Statuses</option>
                <option value="Open">Open</option>
                <option value="In Process">In Process</option>
                <option value="Done">Done</option>
                <option value="Cancelled">Cancelled</option>
              </select>
              <span className="text-sm text-gray-600">
                {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {filteredOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border border-[#e5e5e5] rounded-lg overflow-hidden">
                <thead>
                  <tr className="border-b border-[#e5e5e5]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">PO Number</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Total Value</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Support Fund Used</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Created</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50 border-b border-[#e5e5e5]">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{order.po_number || 'N/A'}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded px-2 py-1 text-[10px] font-bold tracking-wide uppercase ${
                          order.status === 'Open' ? 'bg-gray-200 text-gray-800' :
                          order.status === 'In Process' ? 'bg-blue-100 text-blue-800' :
                          order.status === 'Done' ? 'bg-green-100 text-green-800' :
                          order.status === 'Cancelled' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${order.total_value?.toFixed(2) || '0.00'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${order.support_fund_used?.toFixed(2) || '0.00'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{new Date(order.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                        <Link href={`/client/orders/${order.id}`} className="text-gray-700 hover:text-gray-900">View Details</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No orders found.</p>
              <Link
                href="/client/orders/new"
                className="mt-2 inline-block bg-black text-white px-4 py-2 hover:opacity-90 transition"
              >
                Place Your First Order
              </Link>
            </div>
          )}
        </Card>
      </div>
    </ClientLayout>
  );
}
