'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';
import { generateNetSuiteCSV, downloadCSV, OrderForExport } from '../../../lib/csvExport';
import {
  Card,
  CardBody,
  CardHeader,
  Typography,
  Button,
  Chip,
  IconButton,
} from '../../components/MaterialTailwind';
import { ArrowRightIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';

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
      <div className="p-6 min-h-screen">
        {/* Modern Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Orders Management</h1>
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
        <div className="mb-6">
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
              <Link
                href="/admin/orders/new"
                className="inline-flex items-center px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-500 transition-colors"
              >
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Order
              </Link>
            </div>
          </div>
        </div>

        {/* Material Tailwind Table */}
        <Card className="border border-blue-gray-100 shadow-sm">
          <CardBody className="overflow-x-scroll px-0 pt-0 pb-2">
            <table className="w-full min-w-[640px] table-auto">
              <thead>
                <tr>
                  {["PO Number", "Client", "Company", "Status", "Total", "Support Fund", "Date", "Actions"].map((el) => (
                    <th
                      key={el}
                      className="border-b border-blue-gray-50 py-3 px-5 text-left"
                    >
                      <Typography
                        variant="small"
                        className="text-[11px] font-bold uppercase text-blue-gray-400"
                      >
                        {el}
                      </Typography>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order, index) => {
                  const className = `py-3 px-5 ${
                    index === filteredOrders.length - 1
                      ? ""
                      : "border-b border-blue-gray-50"
                  }`;
                  
                  return (
                    <tr key={order.id}>
                      <td className={className}>
                        <Typography
                          variant="small"
                          color="blue-gray"
                          className="font-semibold"
                        >
                          #{order.po_number || order.id.substring(0, 8)}
                        </Typography>
                      </td>
                      <td className={className}>
                        <div>
                          <Typography
                            variant="small"
                            color="blue-gray"
                            className="font-semibold"
                          >
                            {order.client?.name || 'N/A'}
                          </Typography>
                          <Typography className="text-xs font-normal text-blue-gray-500">
                            {order.client?.email || 'N/A'}
                          </Typography>
                        </div>
                      </td>
                      <td className={className}>
                        <div>
                          <Typography className="text-xs font-semibold text-blue-gray-600">
                            {order.company?.company_name || 'N/A'}
                          </Typography>
                          <Typography className="text-xs font-normal text-blue-gray-500">
                            NetSuite: {order.company?.netsuite_number || 'N/A'}
                          </Typography>
                        </div>
                      </td>
                      <td className={className}>
                        <Chip
                          variant="gradient"
                          color={
                            order.status === 'Open'
                              ? 'orange'
                              : order.status === 'In Process'
                              ? 'blue'
                              : order.status === 'Done'
                              ? 'green'
                              : order.status === 'Cancelled'
                              ? 'red'
                              : 'blue-gray'
                          }
                          value={order.status}
                          className="py-0.5 px-2 text-[11px] font-medium w-fit"
                        />
                      </td>
                      <td className={className}>
                        <Typography className="text-xs font-semibold text-blue-gray-600">
                          ${order.total_value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                        </Typography>
                      </td>
                      <td className={className}>
                        <Typography className="text-xs font-semibold text-blue-gray-600">
                          ${order.support_fund_used?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                        </Typography>
                      </td>
                      <td className={className}>
                        <Typography className="text-xs font-semibold text-blue-gray-600">
                          {new Date(order.created_at).toLocaleDateString()}
                        </Typography>
                      </td>
                      <td className={className}>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-3">
                            <Link href={`/admin/orders/${order.id}`}>
                              <Typography
                                as="a"
                                className="text-xs font-semibold text-blue-gray-600 cursor-pointer hover:text-blue-500"
                              >
                                View
                              </Typography>
                            </Link>
                            <Typography
                              as="button"
                              onClick={() => handleDownloadCSV(order.id)}
                              className="text-xs font-semibold text-blue-gray-600 cursor-pointer hover:text-blue-500"
                            >
                              CSV
                            </Typography>
                          </div>
                          
                          {/* NetSuite Actions */}
                          <div className="space-y-1">
                            {order.netsuite_sales_order_id ? (
                              <Typography className="text-xs text-green-600 font-medium">
                                ✓ NetSuite: {order.netsuite_sales_order_id}
                              </Typography>
                            ) : (
                              <Typography
                                as="button"
                                onClick={() => createOrderInNetSuite(order.id)}
                                className="text-xs text-orange-600 hover:text-orange-800 disabled:opacity-50 font-medium cursor-pointer"
                                disabled={creatingInNetSuite === order.id}
                              >
                                {creatingInNetSuite === order.id ? 'Creating...' : '→ Create in NetSuite'}
                              </Typography>
                            )}
                            
                            {order.status === 'In Process' && order.netsuite_sales_order_id && (
                              <Typography
                                as="button"
                                onClick={() => completeOrder(order.id)}
                                className="block text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50 font-medium cursor-pointer"
                                disabled={completingOrder === order.id}
                              >
                                {completingOrder === order.id ? 'Completing...' : '✓ Mark Complete'}
                              </Typography>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
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

        {/* Material Tailwind Pagination */}
        {totalOrders > ordersPerPage && (
          <div className="flex items-center justify-between mt-4 px-4">
            <div className="flex items-center text-sm text-gray-700">
              <span>Page {currentPage} of {Math.ceil(totalOrders / ordersPerPage)}</span>
              <span className="mx-2">•</span>
              <span>{totalOrders} total orders</span>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="text"
                className="flex items-center gap-2"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ArrowLeftIcon strokeWidth={2} className="h-4 w-4" /> Previous
              </Button>
              <div className="flex items-center gap-2">
                {Array.from({ length: Math.min(5, Math.ceil(totalOrders / ordersPerPage)) }, (_, i) => {
                  const pageNum = i + 1;
                  return (
                    <IconButton
                      key={pageNum}
                      variant={currentPage === pageNum ? "filled" : "text"}
                      color="gray"
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </IconButton>
                  );
                })}
              </div>
              <Button
                variant="text"
                className="flex items-center gap-2"
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalOrders / ordersPerPage), prev + 1))}
                disabled={currentPage >= Math.ceil(totalOrders / ordersPerPage)}
              >
                Next
                <ArrowRightIcon strokeWidth={2} className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
