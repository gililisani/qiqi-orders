'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSupabase } from '../../../lib/supabase-provider';
import Card from '../ui/Card';
import { Spinner, Typography } from '../MaterialTailwind';
import OrderStatusBadge from '../ui/OrderStatusBadge';

type Role = 'admin' | 'client';

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_value: number;
  support_fund_used: number;
  po_number: string;
  user_id?: string;
  company_id?: string;
  netsuite_sales_order_id?: string;
}

interface ClientLite { id: string; name: string; email: string }
interface CompanyLite { id: string; company_name: string; netsuite_number: string }

interface OrdersListViewProps {
  role: Role;
  newOrderUrl: string;
  viewOrderUrl: (orderId: string) => string;
  editOrderUrl?: (orderId: string) => string; // admin-only usage if needed later
}

const statusBadge = (status: string) => <OrderStatusBadge status={status} />;

export default function OrdersListView({ role, newOrderUrl, viewOrderUrl }: OrdersListViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabase } = useSupabase();
  const [orders, setOrders] = useState<Order[]>([]);
  const [clientsMap, setClientsMap] = useState<Map<string, ClientLite>>(new Map());
  const [companiesMap, setCompaniesMap] = useState<Map<string, CompanyLite>>(new Map());
  const [filteredCompanyName, setFilteredCompanyName] = useState<string | null>(null);
  // Loading handled by AdminLayout
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [creatingInNetSuite, setCreatingInNetSuite] = useState<string | null>(null);
  const [completingOrder, setCompletingOrder] = useState<string | null>(null);
  const ordersPerPage = 10;
  
  // Get company_id from URL query parameter
  const companyIdFilter = searchParams?.get('company_id') || null;

  // Fetch company name when filtering by company
  useEffect(() => {
    const fetchFilteredCompany = async () => {
      if (companyIdFilter && role === 'admin') {
        const { data, error } = await supabase
          .from('companies')
          .select('company_name')
          .eq('id', companyIdFilter)
          .single();
        
        if (!error && data) {
          setFilteredCompanyName(data.company_name);
        } else {
          setFilteredCompanyName(null);
        }
      } else {
        setFilteredCompanyName(null);
      }
    };
    
    fetchFilteredCompany();
  }, [companyIdFilter, role, supabase]);

  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, currentPage, statusFilter, companyIdFilter]);

  useEffect(() => {
    const id = setTimeout(() => {
      setCurrentPage(1);
      fetchOrders();
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const fetchOrders = async () => {
    try {
      // Loading handled by AdminLayout
      setError('');

      if (role === 'client') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not found');

        // Get user's company_id
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('company_id')
          .eq('id', user.id)
          .single();

        if (clientError) throw clientError;
        if (!clientData?.company_id) throw new Error('User not associated with a company');

        // Get ALL orders for the company (not just user's orders)
        let query = supabase
          .from('orders')
          .select('*', { count: 'exact' })
          .eq('company_id', clientData.company_id);

        if (statusFilter) query = query.eq('status', statusFilter);
        
        // Search by date, amount, or PO number
        if (searchTerm) {
          // Check if search term looks like a date first
          const dateMatch = searchTerm.match(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}/);
          
          if (dateMatch) {
            // Date search: filter by date range
            let dateStr = dateMatch[0];
            // Normalize date format
            if (dateStr.includes('/')) {
              const [month, day, year] = dateStr.split('/');
              dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            } else if (dateStr.includes('-') && dateStr.length === 10 && dateStr.split('-')[0].length === 2) {
              const [month, day, year] = dateStr.split('-');
              dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            query = query.gte('created_at', `${dateStr}T00:00:00`)
                        .lte('created_at', `${dateStr}T23:59:59`);
          } else {
            // Check if numeric (amount search)
            const numericValue = parseFloat(searchTerm.replace(/[^0-9.-]/g, ''));
            if (!isNaN(numericValue) && numericValue > 0) {
              // Amount search: filter by total_value (within small range for rounding)
              query = query.gte('total_value', numericValue - 0.01)
                          .lte('total_value', numericValue + 0.01);
            } else {
              // PO number search: default fallback
              query = query.ilike('po_number', `%${searchTerm}%`);
            }
          }
        }

        const from = (currentPage - 1) * ordersPerPage;
        const to = from + ordersPerPage - 1;
        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .range(from, to);
        if (error) throw error;
        setTotalOrders(count || 0);
        setOrders(data || []);
        setClientsMap(new Map());
        setCompaniesMap(new Map());
      } else {
        // admin - always show Draft orders regardless of status filter
        let query = supabase
          .from('orders')
          .select('*', { count: 'exact' });

        // Filter by company_id if provided in URL
        if (companyIdFilter) {
          query = query.eq('company_id', companyIdFilter);
        }

        if (statusFilter) {
          // Always include Draft orders in admin view, even when filtering by other statuses
          query = query.in('status', [statusFilter, 'Draft']);
        }
        
        // Enhanced search: company name, date, amount, or PO number
        if (searchTerm) {
          // Check if search term looks like a date first (most specific)
          const dateMatch = searchTerm.match(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}/);
          
          if (dateMatch) {
            // Date search: filter by date range
            let dateStr = dateMatch[0];
            // Normalize date format
            if (dateStr.includes('/')) {
              const [month, day, year] = dateStr.split('/');
              dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            } else if (dateStr.includes('-') && dateStr.length === 10 && dateStr.split('-')[0].length === 2) {
              const [month, day, year] = dateStr.split('-');
              dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
            query = query.gte('created_at', `${dateStr}T00:00:00`)
                        .lte('created_at', `${dateStr}T23:59:59`);
          } else {
            // Check if search term matches a company name
            const { data: matchingCompanies } = await supabase
              .from('companies')
              .select('id')
              .ilike('company_name', `%${searchTerm}%`);
            
            const matchingCompanyIds = matchingCompanies?.map(c => c.id) || [];
            
            if (matchingCompanyIds.length > 0) {
              // Company name search: filter by company_id
              query = query.in('company_id', matchingCompanyIds);
            } else {
              // Check if numeric (amount search)
              const numericValue = parseFloat(searchTerm.replace(/[^0-9.-]/g, ''));
              if (!isNaN(numericValue) && numericValue > 0) {
                // Amount search: filter by total_value (within small range for rounding)
                query = query.gte('total_value', numericValue - 0.01)
                            .lte('total_value', numericValue + 0.01);
              } else {
                // PO number search: default fallback
                query = query.ilike('po_number', `%${searchTerm}%`);
              }
            }
          }
        }

        const from = (currentPage - 1) * ordersPerPage;
        const to = from + ordersPerPage - 1;
        const { data: ordersData, error: ordersError, count } = await query
          .order('created_at', { ascending: false })
          .range(from, to);
        if (ordersError) throw ordersError;

        setTotalOrders(count || 0);

        if (ordersData && ordersData.length > 0) {
          const userIds = [...new Set(ordersData.map((o: Order) => o.user_id).filter(Boolean))] as string[];
          const companyIds = [...new Set(ordersData.map((o: Order) => o.company_id).filter(Boolean))] as string[];
          const [clientsResult, companiesResult] = await Promise.all([
            userIds.length
              ? supabase.from('clients').select('id, name, email').in('id', userIds)
              : Promise.resolve({ data: [], error: null } as any),
            companyIds.length
              ? supabase.from('companies').select('id, company_name, netsuite_number').in('id', companyIds)
              : Promise.resolve({ data: [], error: null } as any)
          ]);

          const cMap = new Map<string, ClientLite>((clientsResult.data || []).map((c: ClientLite) => [c.id, c]));
          const coMap = new Map<string, CompanyLite>((companiesResult.data || []).map((c: CompanyLite) => [c.id, c]));
          setClientsMap(cMap);
          setCompaniesMap(coMap);
          setOrders(ordersData || []);
          
          // Update filtered company name if available in companiesMap
          if (companyIdFilter && coMap.has(companyIdFilter)) {
            setFilteredCompanyName(coMap.get(companyIdFilter)?.company_name || null);
          }
        } else {
          setClientsMap(new Map());
          setCompaniesMap(new Map());
          setOrders([]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load orders');
    } finally {
      // Loading handled by AdminLayout
    }
  };

  const handleDownloadCSV = async (orderId: string) => {
    try {
      // admin-only action
      if (role !== 'admin') return;
      const { generateNetSuiteCSV, downloadCSV } = await import('../../../lib/csvExport');
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
      if (!orderData.company) throw new Error('Company data not found for this order');
      if (!orderData.order_items?.length) throw new Error('No order items found for this order');
      for (const item of orderData.order_items) {
        if (!item.product?.sku) throw new Error('Product SKU missing for order item');
      }
      const csvContent = generateNetSuiteCSV(orderData as any);
      const orderDate = new Date(orderData.created_at);
      const dateStr = orderDate.toISOString().split('T')[0];
      const poNumber = orderData.po_number || orderData.id.substring(0, 6);
      const filename = `Order_${poNumber}_${dateStr}.csv`;
      downloadCSV(csvContent, filename);
    } catch (err) {
      console.error('CSV error', err);
      alert('Failed to export CSV.');
    }
  };

  const createOrderInNetSuite = async (orderId: string) => {
    if (role !== 'admin') return;
    setCreatingInNetSuite(orderId);
    setError('');
    try {
      const response = await fetch('/api/netsuite/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const data = await response.json();
      if (data.success) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, netsuite_sales_order_id: data.netsuiteOrderId } : o));
        alert(`Order created in NetSuite: ${data.netsuiteOrderId}`);
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
    if (role !== 'admin') return;
    setCompletingOrder(orderId);
    setError('');
    try {
      const response = await fetch('/api/orders/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const data = await response.json();
      if (data.success) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'Done' } : o));
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

  const columns = useMemo(() => {
    if (role === 'admin') {
      return ['PO Number', 'Client', 'Company', 'Status', 'Total', 'Support Fund', 'Date', 'Actions'];
    }
    return ['PO Number', 'Status', 'Total Value', 'Support Funds Used', 'Created', 'Actions'];
  }, [role]);

  // Let AdminLayout handle loading - no separate loading state needed

  // Handle loading state - show nothing while data loads (AdminLayout handles main loading)
  if (orders.length === 0 && !error) {
    return null;
  }

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-gray-900">Orders</h2>
        {companyIdFilter && filteredCompanyName && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Filtered by:</span>
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              {filteredCompanyName}
            </span>
            <Link 
              href="/admin/orders" 
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Clear filter
            </Link>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

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
              {['Open','In Process','Ready','Done','Cancelled'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Link href={newOrderUrl} className="inline-flex items-center px-3 py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-900">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Order
            </Link>
          </div>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full border border-[#e5e5e5] rounded-lg overflow-hidden">
            <thead>
              <tr className="border-b border-[#e5e5e5]">
                {columns.map((el) => (
                  <th key={el} className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">{el}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-gray-500">
                    <div className="flex flex-col items-center">
                      <svg className="w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-lg font-medium mb-1">No orders to display</p>
                      <p className="text-sm">
                        {statusFilter ? `No orders with status "${statusFilter}"` : 'No orders found'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                <tr 
                  key={order.id} 
                  onClick={() => router.push(viewOrderUrl(order.id))}
                  className="hover:bg-gray-50 border-b border-[#e5e5e5] cursor-pointer"
                >
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">#{order.po_number || order.id.substring(0, 8)}</td>

                  {role === 'admin' ? (
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-800">{clientsMap.get(order.user_id || '')?.name || 'N/A'}</span>
                        <span className="text-xs text-gray-500">{clientsMap.get(order.user_id || '')?.email || 'N/A'}</span>
                      </div>
                    </td>
                  ) : null}

                  {role === 'admin' ? (
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-800">{companiesMap.get(order.company_id || '')?.company_name || 'N/A'}</span>
                        <span className="text-xs text-gray-500">NetSuite: {companiesMap.get(order.company_id || '')?.netsuite_number || 'N/A'}</span>
                      </div>
                    </td>
                  ) : null}

                  <td className="px-4 py-3 whitespace-nowrap">{statusBadge(order.status)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${order.total_value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${order.support_fund_used?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{new Date(order.created_at).toLocaleDateString()}</td>

                  <td className="px-4 py-3 whitespace-nowrap text-sm" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-3">
                      <Link className="text-blue-600 hover:text-blue-800" href={viewOrderUrl(order.id)}>View</Link>
                      {role === 'admin' && (
                        <button onClick={() => handleDownloadCSV(order.id)} className="text-gray-700 hover:text-gray-900">CSV</button>
                      )}
                    </div>
                    {role === 'admin' && (
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
                    )}
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalOrders > ordersPerPage && (
          <div className="mt-4 flex items-center justify-between px-4">
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

      {orders.length === 0 && (
        <div className="bg-white rounded-md border border-gray-200 p-8 text-center">
          <svg className="mx-auto h-8 w-8 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-base font-medium text-gray-900 mb-1">No orders found</h3>
          <p className="text-sm text-gray-500">{role === 'admin' ? 'Orders will appear here when clients place them.' : 'You can place a new order.'}</p>
        </div>
      )}
    </div>
  );
}


