'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AdminLayout from '../components/AdminLayout';
import Link from 'next/link';

interface Order {
  id: string;
  created_at: string;
  total_value: number;
  status: string;
  po_number: string;
  companies: {
    company_name: string;
  }[] | null;
}

interface DashboardStats {
  todayOrders: number;
  todayOrdersValue: number;
  openOrders: number;
  inProcessOrders: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    todayOrders: 0,
    todayOrdersValue: 0,
    openOrders: 0,
    inProcessOrders: 0
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Format currency helper
  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Fetch all orders with company data
      const { data: orders, error } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          total_value,
          status,
          po_number,
          company_id,
          companies(company_name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Use orders directly since they already have the correct structure
      const transformedOrders = orders || [];

      // Calculate stats
      const todayOrders = transformedOrders.filter(order => 
        order.created_at.split('T')[0] === today
      );
      
      const openOrders = transformedOrders.filter(order => order.status === 'Open');
      const inProcessOrders = transformedOrders.filter(order => order.status === 'In Process');

      const todayOrdersValue = todayOrders.reduce((sum, order) => sum + (order.total_value || 0), 0);

      setStats({
        todayOrders: todayOrders.length,
        todayOrdersValue,
        openOrders: openOrders.length,
        inProcessOrders: inProcessOrders.length
      });

      // Get recent 5 orders
      setRecentOrders(transformedOrders.slice(0, 5));

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
        
        {/* Stats Blocks */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Today's Orders */}
          <div className="bg-white p-6 border border-black">
            <div className="text-center">
              <div className="text-5xl font-bold text-black mb-2">{stats.todayOrders}</div>
              <div className="text-sm text-gray-600">New Orders Today</div>
              <div className="text-xs text-gray-500 mt-1">{formatCurrency(stats.todayOrdersValue)}</div>
            </div>
          </div>

          {/* Open Orders */}
          <div className="bg-white p-6 border border-black">
            <div className="text-center">
              <div className="text-5xl font-bold text-black mb-2">{stats.openOrders}</div>
              <div className="text-sm text-gray-600">Open Orders</div>
            </div>
          </div>

          {/* In Process Orders */}
          <div className="bg-white p-6 border border-black">
            <div className="text-center">
              <div className="text-5xl font-bold text-black mb-2">{stats.inProcessOrders}</div>
              <div className="text-sm text-gray-600">Orders In Process</div>
            </div>
          </div>

          {/* Hello Block */}
          <div className="bg-white p-6 border border-black">
            <div className="text-center">
              <div className="text-5xl font-bold text-black mb-2">HELLO</div>
              <div className="text-sm text-gray-600">Coming Soon</div>
            </div>
          </div>
        </div>

        {/* Recent Orders Table */}
        <div className="bg-transparent">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold uppercase">RECENT ORDERS</h2>
            <Link
              href="/admin/orders"
              className="text-sm text-black underline hover:opacity-70 uppercase"
            >
              VIEW ALL
            </Link>
          </div>
          <div className="space-y-4">
            {recentOrders.map((order) => (
              <div 
                key={order.id} 
                className="bg-white border border-gray-300 border-dashed p-6 hover:border-black hover:border-dashed transition-colors duration-200"
              >
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
                  <div>
                    <div className="text-xs text-gray-500 uppercase">PO Number</div>
                    <div className="text-sm font-medium text-gray-900">
                      {order.po_number || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase">Company</div>
                    <div className="text-sm text-gray-900">
                      {(() => {
                        const companies = order.companies;
                        if (!companies) return 'N/A';
                        // Handle both array and object cases
                        const companyName = Array.isArray(companies) 
                          ? companies[0]?.company_name 
                          : (companies as any).company_name;
                        return companyName || 'N/A';
                      })()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase">Status</div>
                    <div 
                      className="text-sm font-bold border border-black px-2 py-1 inline-block"
                      style={{ fontFamily: "'ABC P3rman3nt', monospace" }}
                    >
                      {order.status}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase">Total</div>
                    <div className="text-sm text-gray-900">
                      {formatCurrency(order.total_value || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase">Date</div>
                    <div className="text-sm text-gray-500">
                      {new Date(order.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase">Actions</div>
                    <div className="flex items-center space-x-2">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-black underline hover:opacity-70 text-sm"
                      >
                        View
                      </Link>
                      <button className="bg-black text-white px-2 py-1 text-xs hover:opacity-90 transition">
                        CSV
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {recentOrders.length === 0 && (
            <div className="py-12 text-center text-gray-500">
              No orders found
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
