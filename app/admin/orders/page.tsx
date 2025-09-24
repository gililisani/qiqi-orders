'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';
import { generateNetSuiteCSV, downloadCSV, OrderForExport } from '../../../lib/csvExport';
import Card from '../../components/ui/Card';

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_value: number;
  support_fund_used: number;
  credit_earned: number;
  user_id: string;
  company_id: string;
  po_number: string;
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
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const ordersPerPage = 10;

  useEffect(() => {
    fetchOrders();
  }, [currentPage, statusFilter]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setCurrentPage(1); // Reset to first page on search
      fetchOrders();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchTerm]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      
      // Build query with filters
      let query = supabase
        .from('orders')
        .select('*', { count: 'exact' });

      // Apply filters
      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      // Apply search filter on order fields first
      if (searchTerm) {
        query = query.or(`id.ilike.%${searchTerm}%,po_number.ilike.%${searchTerm}%`);
      }

      // Add pagination
      const from = (currentPage - 1) * ordersPerPage;
      const to = from + ordersPerPage - 1;
      
      const { data: ordersData, error: ordersError, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (ordersError) throw ordersError;
      setTotalOrders(count || 0);

      // Efficiently fetch related data in batches
      if (ordersData && ordersData.length > 0) {
        const userIds = [...new Set(ordersData.map(order => order.user_id))];
        const companyIds = [...new Set(ordersData.map(order => order.company_id).filter(Boolean))];

        // Fetch all clients and companies in batch
        const [clientsResult, companiesResult] = await Promise.all([
          supabase
            .from('clients')
            .select('id, name, email')
            .in('id', userIds),
          supabase
            .from('companies')
            .select('id, company_name, netsuite_number')
            .in('id', companyIds)
        ]);

        // Create lookup maps
        const clientsMap = new Map(clientsResult.data?.map(client => [client.id, client]) || []);
        const companiesMap = new Map(companiesResult.data?.map(company => [company.id, company]) || []);

        // Combine data efficiently
        const ordersWithDetails = ordersData.map(order => ({
          ...order,
          client: clientsMap.get(order.user_id) || null,
          company: companiesMap.get(order.company_id) || null
        }));

        setOrders(ordersWithDetails);
      } else {
        setOrders([]);
      }
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

      console.log('CSV Export - Order data:', orderData);
      console.log('CSV Export - Company data:', orderData.company);
      console.log('CSV Export - Order items:', orderData.order_items);

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

      console.log('CSV Export - All validations passed, generating CSV...');

      // Generate CSV
      const csvContent = generateNetSuiteCSV(orderData as OrderForExport);
      
      console.log('CSV Export - CSV generated successfully');
      
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

  // Remove client-side filtering since we're doing server-side filtering
  const filteredOrders = orders;

  if (loading) {
    return (
      <AdminLayout>
        <div className="py-6">
          <p>Loading orders...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Modern Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Orders</h1>
            <p className="text-gray-500 mt-1 text-sm">Manage and track all orders</p>
          </div>
          <div className="text-xs text-gray-400">
            Showing {((currentPage - 1) * ordersPerPage) + 1}-{Math.min(currentPage * ordersPerPage, totalOrders)} of {totalOrders} orders
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        {/* Modern Action Bar */}
        <div>
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div className="relative flex-1 max-w-md">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white min-w-[120px]"
              >
                <option value="">All Statuses</option>
                {statusOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Link href="/admin/orders/new" className="inline-flex items-center px-3 py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-900">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Order
              </Link>
            </div>
          </div>
        </div>

        {/* Table (Form Kit style) */}
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-[#e5e5e5] rounded-lg overflow-hidden">
              <thead>
                <tr className="border-b border-[#e5e5e5]">
                  {['PO Number','Client','Company','Status','Total','Support Fund','Date','Actions'].map((el) => (
                    <th key={el} className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">{el}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50 border-b border-[#e5e5e5]">
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">#{order.po_number || order.id.substring(0, 8)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-800">{order.client?.name || 'N/A'}</span>
                        <span className="text-xs text-gray-500">{order.client?.email || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-800">{order.company?.company_name || 'N/A'}</span>
                        <span className="text-xs text-gray-500">NetSuite: {order.company?.netsuite_number || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded px-2 py-1 text-[10px] font-bold tracking-wide uppercase ${
                        order.status === 'Open'
                          ? 'bg-gray-200 text-gray-800'
                          : order.status === 'In Process'
                          ? 'bg-blue-100 text-blue-800'
                          : order.status === 'Done'
                          ? 'bg-green-100 text-green-800'
                          : order.status === 'Cancelled'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}>{order.status}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${order.total_value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${order.support_fund_used?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{new Date(order.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="flex gap-3">
                        <Link className="text-blue-600 hover:text-blue-800" href={`/admin/orders/${order.id}`}>View</Link>
                        <button onClick={() => handleDownloadCSV(order.id)} className="text-gray-700 hover:text-gray-900">CSV</button>
                      </div>
                      {/* NetSuite Actions */}
                      <div className="mt-1 space-y-1">
                        {order.netsuite_sales_order_id ? (
                          <span className="text-xs text-green-600 font-medium">✓ NetSuite: {order.netsuite_sales_order_id}</span>
                        ) : (
                          <button
                            onClick={() => createOrderInNetSuite(order.id)}
                            className="text-xs text-orange-600 hover:text-orange-800 disabled:opacity-50 font-medium"
                            disabled={creatingInNetSuite === order.id}
                          >
                            {creatingInNetSuite === order.id ? 'Creating...' : '→ Create in NetSuite'}
                          </button>
                        )}
                        {order.status === 'In Process' && order.netsuite_sales_order_id && (
                          <button
                            onClick={() => completeOrder(order.id)}
                            className="block text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 font-medium"
                            disabled={completingOrder === order.id}
                          >
                            {completingOrder === order.id ? 'Completing...' : '✓ Mark Complete'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination (Form Kit style) */}
          {totalOrders > ordersPerPage && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-600">Page {currentPage} of {Math.ceil(totalOrders / ordersPerPage)}</p>
              <nav className="inline-flex items-center gap-1" aria-label="Pagination">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 text-sm text-gray-700 border border-[#e5e5e5] rounded hover:bg-gray-50 disabled:opacity-50"
                >Prev</button>
                {Array.from({ length: Math.min(5, Math.ceil(totalOrders / ordersPerPage)) }, (_, i) => {
                  const pageNum = i + 1;
                  const isActive = currentPage === pageNum;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`${isActive ? 'text-white bg-black border border-black' : 'text-gray-700 border border-[#e5e5e5] hover:bg-gray-50'} px-3 py-1.5 text-sm rounded`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalOrders / ordersPerPage), prev + 1))}
                  disabled={currentPage >= Math.ceil(totalOrders / ordersPerPage)}
                  className="px-3 py-1.5 text-sm text-gray-700 border border-[#e5e5e5] rounded hover:bg-gray-50 disabled:opacity-50"
                >Next</button>
              </nav>
            </div>
          )}
        </Card>

        {filteredOrders.length === 0 && !loading && (
          <div className="bg-white rounded-md border border-gray-200 p-8 text-center">
            <svg className="mx-auto h-8 w-8 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="text-base font-medium text-gray-900 mb-1">No orders found</h3>
            <p className="text-sm text-gray-500">Orders will appear here when clients place them.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
