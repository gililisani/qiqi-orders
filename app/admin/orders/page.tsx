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
        <div className="p-6">
          <p>Loading orders...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="custom-table-header">
          <h1 className="custom-table-title">ORDERS MANAGEMENT</h1>
          <div className="text-sm text-gray-500">
            Showing {((currentPage - 1) * ordersPerPage) + 1}-{Math.min(currentPage * ordersPerPage, totalOrders)} of {totalOrders} orders
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

        <div className="custom-table-container">
          {/* Table Headers */}
          <div className="custom-table-column-headers">
            <div className="grid grid-cols-1 md:grid-cols-8 gap-4 items-center">
              <div className="custom-table-column-header">PO Number</div>
              <div className="custom-table-column-header">Client</div>
              <div className="custom-table-column-header">Company</div>
              <div className="custom-table-column-header">Status</div>
              <div className="custom-table-column-header">Total Value</div>
              <div className="custom-table-column-header">Support Fund Used</div>
              <div className="custom-table-column-header">Created</div>
              <div className="custom-table-column-header">Actions</div>
            </div>
          </div>

          {/* Table Rows */}
          <div className="custom-table-rows">
            {filteredOrders.map((order) => (
              <div key={order.id} className="custom-table-row">
                <div className="grid grid-cols-1 md:grid-cols-8 gap-4 items-center">
                  {/* PO Number */}
                  <div className="custom-table-cell-primary">
                    {order.po_number || 'N/A'}
                  </div>

                  {/* Client */}
                  <div className="custom-table-cell">
                    <div className="text-sm font-medium text-gray-900">
                      {order.client?.name || 'N/A'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {order.client?.email || 'N/A'}
                    </div>
                  </div>

                  {/* Company */}
                  <div className="custom-table-cell">
                    <div className="text-sm font-medium text-gray-900">
                      {order.company?.company_name || 'N/A'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {order.company?.netsuite_number || 'N/A'}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="custom-status-container">
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusChange(order.id, e.target.value)}
                      className="custom-status-badge bg-white cursor-pointer"
                    >
                      {statusOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Total Value */}
                  <div className="custom-table-cell">
                    ${order.total_value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                  </div>

                  {/* Support Fund Used */}
                  <div className="custom-table-cell">
                    ${order.support_fund_used?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                  </div>

                  {/* Created Date */}
                  <div className="custom-table-cell-secondary">
                    {new Date(order.created_at).toLocaleDateString()}
                  </div>

                  {/* Actions */}
                  <div className="custom-table-actions">
                    <div className="flex flex-col space-y-2">
                      <div className="flex space-x-2 justify-center">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="custom-table-action-button"
                        >
                          VIEW
                        </Link>
                        <button
                          onClick={() => handleDownloadCSV(order.id)}
                          className="custom-table-csv-button"
                        >
                          CSV
                        </button>
                      </div>
                      <div className="space-y-1">
                        {order.netsuite_sales_order_id ? (
                          <div className="text-xs text-green-600 text-center">
                            NetSuite: {order.netsuite_sales_order_id}
                          </div>
                        ) : (
                          <button
                            onClick={() => createOrderInNetSuite(order.id)}
                            disabled={creatingInNetSuite === order.id}
                            className="text-xs text-orange-600 hover:text-orange-900 disabled:opacity-50 block text-center"
                          >
                            {creatingInNetSuite === order.id ? 'Creating...' : 'Create in NetSuite'}
                          </button>
                        )}
                        
                        {/* Complete Order Button */}
                        {order.status === 'In Process' && order.netsuite_sales_order_id && (
                          <button
                            onClick={() => completeOrder(order.id)}
                            disabled={completingOrder === order.id}
                            className="text-xs text-blue-600 hover:text-blue-900 disabled:opacity-50 block text-center"
                          >
                            {completingOrder === order.id ? 'Completing...' : 'Mark Complete'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {filteredOrders.length === 0 && !loading && (
          <div className="custom-table-empty">
            <p>No orders found.</p>
            <p className="text-sm mt-2">Orders will appear here when clients place them.</p>
          </div>
        )}

        {/* Pagination */}
        {totalOrders > ordersPerPage && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Page {currentPage} of {Math.ceil(totalOrders / ordersPerPage)}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalOrders / ordersPerPage), prev + 1))}
                disabled={currentPage >= Math.ceil(totalOrders / ordersPerPage)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
