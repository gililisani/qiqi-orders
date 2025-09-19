'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AdminLayout from '../components/AdminLayout';
import Link from 'next/link';
import { generateNetSuiteCSV, downloadCSV, OrderForExport } from '../../lib/csvExport';

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

  // CSV download function
  const handleDownloadCSV = async (orderId: string) => {
    try {
      // Fetch complete order data with all relationships
      const { data: orderData, error } = await supabase
        .from('orders')
        .select(`
          *,
          company:companies(
            company_name,
            netsuite_number,
            class:classes(name),
            subsidiary:subsidiaries(name),
            location:Locations(location_name)
          ),
          order_items(
            quantity,
            unit_price,
            total_price,
            product:Products(sku, item_name, netsuite_name)
          )
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;

      // Validate required data
      if (!orderData.company) {
        throw new Error('Company data not found for this order');
      }
      if (!orderData.order_items || orderData.order_items.length === 0) {
        throw new Error('No order items found for this order');
      }

      // Validate order items have required product data
      for (const item of orderData.order_items) {
        if (!item.product) {
          throw new Error('Product data missing for order item');
        }
        if (!item.product.sku) {
          throw new Error('Product SKU missing for order item');
        }
      }

      // Generate CSV
      const csvContent = generateNetSuiteCSV(orderData as OrderForExport);
      
      // Create filename with PO number and date
      const orderDate = new Date(orderData.created_at);
      const dateStr = orderDate.toISOString().split('T')[0];
      const poNumber = orderData.po_number || orderData.id.substring(0, 6);
      const filename = `Order_${poNumber}_${dateStr}.csv`;
      
      // Download CSV
      downloadCSV(csvContent, filename);
    } catch (err: any) {
      console.error('Error exporting CSV:', err);
      alert('Failed to export CSV. Please try again.');
    }
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
          <div className="p-6 border border-black" style={{ backgroundColor: 'rgb(244, 244, 242)' }}>
            <div className="text-center">
              <div className="text-5xl font-bold text-black mb-2">{stats.todayOrders}</div>
              <div className="text-sm text-gray-600">New Orders Today</div>
              <div className="text-xs text-gray-500 mt-1">{formatCurrency(stats.todayOrdersValue)}</div>
            </div>
          </div>

          {/* Open Orders */}
          <div className="p-6 border border-black" style={{ backgroundColor: 'rgb(244, 244, 242)' }}>
            <div className="text-center">
              <div className="text-5xl font-bold text-black mb-2">{stats.openOrders}</div>
              <div className="text-sm text-gray-600">Open Orders</div>
            </div>
          </div>

          {/* In Process Orders */}
          <div className="p-6 border border-black" style={{ backgroundColor: 'rgb(244, 244, 242)' }}>
            <div className="text-center">
              <div className="text-5xl font-bold text-black mb-2">{stats.inProcessOrders}</div>
              <div className="text-sm text-gray-600">Orders In Process</div>
            </div>
          </div>

          {/* Hello Block */}
          <div className="p-6 border border-black" style={{ backgroundColor: 'rgb(244, 244, 242)' }}>
            <div className="text-center">
              <div className="text-5xl font-bold text-black mb-2">HELLO</div>
              <div className="text-sm text-gray-600">Coming Soon</div>
            </div>
          </div>
        </div>

        {/* Recent Orders Table */}
        <div className="bg-transparent">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-light uppercase">RECENT ORDERS</h2>
            <Link
              href="/admin/orders"
              className="text-sm text-black underline hover:opacity-70 uppercase"
            >
              VIEW ALL
            </Link>
          </div>
          
          {/* Table Header */}
          <div className="px-6 py-2 mb-2">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
              <div className="text-xs text-black uppercase font-medium text-center">PO Number</div>
              <div className="text-xs text-black uppercase font-medium text-center">Company</div>
              <div className="text-xs text-black uppercase font-medium text-center">Status</div>
              <div className="text-xs text-black uppercase font-medium text-center">Total</div>
              <div className="text-xs text-black uppercase font-medium text-center">Date</div>
              <div className="text-xs text-black uppercase font-medium text-center">Actions</div>
            </div>
          </div>
          
          <div className="space-y-4">
            {recentOrders.map((order) => (
              <div 
                key={order.id} 
                className="bg-white border border-gray-300 border-dashed hover:border-black hover:border-dashed transition-colors duration-200"
                style={{ padding: '20px' }}
              >
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-center">
                  <div className="text-sm font-medium text-gray-900 text-center">
                    {order.po_number || 'N/A'}
                  </div>
                  <div className="text-sm text-gray-900 text-center">
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
                  <div className="flex justify-center">
                    <span 
                      className="text-xs tracking-wide leading-none px-3 pt-1 pb-1 w-fit h-fit grid place-items-center transition-colors duration-0 border border-black uppercase whitespace-nowrap"
                      style={{ 
                        fontFamily: "'RTKassebong', monospace"
                      }}
                    >
                      {order.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-900 text-center">
                    {formatCurrency(order.total_value || 0)}
                  </div>
                  <div className="text-sm text-gray-500 text-center">
                    {new Date(order.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex items-center justify-center space-x-2">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-black underline hover:opacity-70 text-sm uppercase"
                    >
                      VIEW
                    </Link>
                    <button 
                      onClick={() => handleDownloadCSV(order.id)}
                      className="bg-black text-white px-2 py-1 text-xs hover:opacity-90 transition"
                    >
                      CSV
                    </button>
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
