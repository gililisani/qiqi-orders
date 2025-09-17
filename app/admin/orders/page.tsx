'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';
import { generateNetSuiteCSV, downloadCSV, OrderForExport } from '../../../lib/csvExport';

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_value: number;
  support_fund_used: number;
  user_id: string;
  company_id: string;
  netsuite_sales_order_id?: string;
  netsuite_status?: string;
  client?: {
    name: string;
    email: string;
  };
  company?: {
    company_name: string;
    netsuite_number: string;
  };
}

const statusOptions = [
  { value: 'Open', label: 'Open', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'In Process', label: 'In Process', color: 'bg-blue-100 text-blue-800' },
  { value: 'Done', label: 'Done', color: 'bg-green-100 text-green-800' },
  { value: 'Cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' }
];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [creatingInNetSuite, setCreatingInNetSuite] = useState<string | null>(null);
  const [completingOrder, setCompletingOrder] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      // Fetch orders first
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // Fetch client and company data separately
      const ordersWithDetails = await Promise.all(
        (ordersData || []).map(async (order) => {
          // Get client info
          const { data: clientData } = await supabase
            .from('clients')
            .select('name, email')
            .eq('id', order.user_id)
            .single();

          // Get company info
          const { data: companyData } = await supabase
            .from('companies')
            .select('company_name, netsuite_number')
            .eq('id', order.company_id)
            .single();

          return {
            ...order,
            client: clientData,
            company: companyData
          };
        })
      );

      setOrders(ordersWithDetails);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;
      fetchOrders(); // Refresh the list
    } catch (err: any) {
      setError(err.message);
    }
  };

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
            po_number,
            class:classes(name),
            subsidiary:subsidiaries(name),
            location:Locations(location_name)
          ),
          order_items(
            quantity,
            unit_price,
            total_price,
            product:Products(sku, item_name)
          )
        `)
        .eq('id', orderId)
        .single();

      if (error) throw error;

      // Generate CSV
      const csvContent = generateNetSuiteCSV(orderData as OrderForExport);
      
      // Create filename with order ID and date
      const orderDate = new Date(orderData.created_at);
      const dateStr = orderDate.toISOString().split('T')[0];
      const filename = `Order_${orderData.id}_${dateStr}.csv`;
      
      // Download CSV
      downloadCSV(csvContent, filename);
    } catch (err: any) {
      console.error('Error exporting CSV:', err);
      alert('Failed to export CSV. Please try again.');
    }
  };

  const createOrderInNetSuite = async (orderId: string) => {
    setCreatingInNetSuite(orderId);
    setError('');

    try {
      const response = await fetch('/api/netsuite/orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId }),
      });

      const data = await response.json();

      if (data.success) {
        // Update the order in the local state
        setOrders(prev => prev.map(order => 
          order.id === orderId 
            ? { 
                ...order, 
                netsuite_sales_order_id: data.netsuiteOrderId,
                netsuite_status: 'created'
              } 
            : order
        ));
        alert(`Order successfully created in NetSuite with ID: ${data.netsuiteOrderId}`);
      } else {
        setError(data.error || 'Failed to create order in NetSuite');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create order in NetSuite');
    } finally {
      setCreatingInNetSuite(null);
    }
  };

  const completeOrder = async (orderId: string) => {
    setCompletingOrder(orderId);
    setError('');

    try {
      const response = await fetch('/api/orders/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId }),
      });

      const data = await response.json();

      if (data.success) {
        // Update the order in the local state
        setOrders(prev => prev.map(order => 
          order.id === orderId 
            ? { 
                ...order, 
                status: 'Done',
                netsuite_status: 'fulfilled'
              } 
            : order
        ));
        alert(`Order ${orderId.substring(0, 8)} has been marked as completed.`);
      } else {
        setError(data.error || 'Failed to complete order');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to complete order');
    } finally {
      setCompletingOrder(null);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.client?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.client?.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.company?.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.company?.netsuite_number.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === '' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading orders...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Orders Management</h1>
          <div className="text-sm text-gray-500">
            {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            placeholder="Search orders by client, company, or NetSuite number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="">All Statuses</option>
            {statusOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-lg shadow border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Client
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Support Fund Used
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {order.id.substring(0, 8)}...
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {order.client?.name || 'N/A'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {order.client?.email || 'N/A'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {order.company?.company_name || 'N/A'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {order.company?.netsuite_number || 'N/A'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <select
                        value={order.status}
                        onChange={(e) => handleStatusChange(order.id, e.target.value)}
                        className={`text-xs px-2 py-1 rounded-full border-0 focus:ring-2 focus:ring-black ${
                          statusOptions.find(s => s.value === order.status)?.color || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {statusOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${order.total_value?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${order.support_fund_used?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(order.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex flex-col space-y-1">
                        <div className="flex space-x-2">
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => handleDownloadCSV(order.id)}
                            className="text-green-600 hover:text-green-900"
                          >
                            CSV
                          </button>
                        </div>
                        <div className="space-y-1">
                          {order.netsuite_sales_order_id ? (
                            <div className="text-xs text-green-600">
                              NetSuite: {order.netsuite_sales_order_id}
                            </div>
                          ) : (
                            <button
                              onClick={() => createOrderInNetSuite(order.id)}
                              disabled={creatingInNetSuite === order.id}
                              className="text-xs text-orange-600 hover:text-orange-900 disabled:opacity-50"
                            >
                              {creatingInNetSuite === order.id ? 'Creating...' : 'Create in NetSuite'}
                            </button>
                          )}
                          
                          {/* Complete Order Button */}
                          {order.status === 'In Process' && order.netsuite_sales_order_id && (
                            <button
                              onClick={() => completeOrder(order.id)}
                              disabled={completingOrder === order.id}
                              className="text-xs text-blue-600 hover:text-blue-900 disabled:opacity-50 block"
                            >
                              {completingOrder === order.id ? 'Completing...' : 'Mark Complete'}
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {filteredOrders.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No orders found.</p>
            <p className="text-sm mt-2">Orders will appear here when clients place them.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
