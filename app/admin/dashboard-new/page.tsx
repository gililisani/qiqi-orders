'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import TemplateSidenav from '../../components/TemplateSidenav';
import TemplateNavbar from '../../components/TemplateNavbar';
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

// Heroicons
const ShoppingBagIcon = () => (
  <svg className="tw-h-7 tw-w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
  </svg>
);

const CurrencyDollarIcon = () => (
  <svg className="tw-h-7 tw-w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const ClockIcon = () => (
  <svg className="tw-h-7 tw-w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const CheckCircleIcon = () => (
  <svg className="tw-h-7 tw-w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
);

const EyeIcon = () => (
  <svg className="tw-h-4 tw-w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);

export default function TemplateDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    todayOrders: 0,
    todayOrdersValue: 0,
    openOrders: 0,
    inProcessOrders: 0
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSidenav, setOpenSidenav] = useState(false);

  // Format currency helper
  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Format date helper
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Open':
        return 'tw-bg-yellow-100 tw-text-yellow-800';
      case 'In Process':
        return 'tw-bg-blue-100 tw-text-blue-800';
      case 'Done':
        return 'tw-bg-green-100 tw-text-green-800';
      case 'Cancelled':
        return 'tw-bg-red-100 tw-text-red-800';
      default:
        return 'tw-bg-gray-100 tw-text-gray-800';
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch dashboard stats
      const today = new Date().toISOString().split('T')[0];
      
      const { data: todayOrdersData } = await supabase
        .from('orders')
        .select('total_value')
        .gte('created_at', `${today}T00:00:00.000Z`)
        .lt('created_at', `${today}T23:59:59.999Z`);

      const { data: openOrdersData } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'Open');

      const { data: inProcessOrdersData } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'In Process');

      // Fetch recent orders
      const { data: ordersData } = await supabase
        .from('orders')
        .select(`
          id,
          created_at,
          total_value,
          status,
          po_number,
          companies:companies(company_name)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      const todayOrdersValue = todayOrdersData?.reduce((sum, order) => sum + (order.total_value || 0), 0) || 0;

      setStats({
        todayOrders: todayOrdersData?.length || 0,
        todayOrdersValue,
        openOrders: openOrdersData?.length || 0,
        inProcessOrders: inProcessOrdersData?.length || 0
      });

      setRecentOrders((ordersData as any) || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="tw-min-h-screen tw-bg-blue-gray-50">
        <div className="tw-flex tw-items-center tw-justify-center tw-h-screen">
          <div className="tw-animate-spin tw-rounded-full tw-h-32 tw-w-32 tw-border-b-2 tw-border-blue-gray-900"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="tw-min-h-screen tw-bg-blue-gray-50">
      {/* Sidenav */}
      <TemplateSidenav 
        openSidenav={openSidenav} 
        setOpenSidenav={setOpenSidenav} 
      />

      {/* Main Content */}
      <div className="tw-p-4 xl:tw-ml-80">
        {/* Dashboard Content */}
        <div className="tw-mt-8 tw-mb-4">
          {/* Statistics Cards */}
          <div className="tw-grid tw-grid-cols-1 tw-gap-6 tw-mb-8 md:tw-grid-cols-2 lg:tw-grid-cols-4">
            {/* Today's Orders */}
            <div className="tw-relative tw-flex tw-flex-col tw-bg-white tw-clip-border tw-rounded-xl tw-shadow-md tw-shadow-blue-gray-500/5 tw-border tw-border-blue-gray-100">
              <div className="tw-relative tw-mx-4 tw-mt-4 tw-overflow-hidden tw-bg-gradient-to-tr tw-from-blue-600 tw-to-blue-400 tw-clip-border tw-rounded-xl tw-shadow-lg tw-shadow-blue-500/40 tw-grid tw-place-items-center tw-h-16 tw-w-16">
                <ShoppingBagIcon />
              </div>
              <div className="tw-p-6 tw-text-right">
                <h4 className="tw-block tw-antialiased tw-tracking-normal tw-font-sans tw-text-2xl tw-font-semibold tw-leading-snup tw-text-blue-gray-900">
                  {stats.todayOrders}
                </h4>
                <p className="tw-block tw-antialiased tw-font-sans tw-text-sm tw-leading-normal tw-font-normal tw-text-blue-gray-600">
                  Today's Orders
                </p>
              </div>
            </div>

            {/* Today's Revenue */}
            <div className="tw-relative tw-flex tw-flex-col tw-bg-white tw-clip-border tw-rounded-xl tw-shadow-md tw-shadow-blue-gray-500/5 tw-border tw-border-blue-gray-100">
              <div className="tw-relative tw-mx-4 tw-mt-4 tw-overflow-hidden tw-bg-gradient-to-tr tw-from-green-600 tw-to-green-400 tw-clip-border tw-rounded-xl tw-shadow-lg tw-shadow-green-500/40 tw-grid tw-place-items-center tw-h-16 tw-w-16">
                <CurrencyDollarIcon />
              </div>
              <div className="tw-p-6 tw-text-right">
                <h4 className="tw-block tw-antialiased tw-tracking-normal tw-font-sans tw-text-2xl tw-font-semibold tw-leading-snup tw-text-blue-gray-900">
                  {formatCurrency(stats.todayOrdersValue)}
                </h4>
                <p className="tw-block tw-antialiased tw-font-sans tw-text-sm tw-leading-normal tw-font-normal tw-text-blue-gray-600">
                  Today's Revenue
                </p>
              </div>
            </div>

            {/* Open Orders */}
            <div className="tw-relative tw-flex tw-flex-col tw-bg-white tw-clip-border tw-rounded-xl tw-shadow-md tw-shadow-blue-gray-500/5 tw-border tw-border-blue-gray-100">
              <div className="tw-relative tw-mx-4 tw-mt-4 tw-overflow-hidden tw-bg-gradient-to-tr tw-from-orange-600 tw-to-orange-400 tw-clip-border tw-rounded-xl tw-shadow-lg tw-shadow-orange-500/40 tw-grid tw-place-items-center tw-h-16 tw-w-16">
                <ClockIcon />
              </div>
              <div className="tw-p-6 tw-text-right">
                <h4 className="tw-block tw-antialiased tw-tracking-normal tw-font-sans tw-text-2xl tw-font-semibold tw-leading-snup tw-text-blue-gray-900">
                  {stats.openOrders}
                </h4>
                <p className="tw-block tw-antialiased tw-font-sans tw-text-sm tw-leading-normal tw-font-normal tw-text-blue-gray-600">
                  Open Orders
                </p>
              </div>
            </div>

            {/* In Process Orders */}
            <div className="tw-relative tw-flex tw-flex-col tw-bg-white tw-clip-border tw-rounded-xl tw-shadow-md tw-shadow-blue-gray-500/5 tw-border tw-border-blue-gray-100">
              <div className="tw-relative tw-mx-4 tw-mt-4 tw-overflow-hidden tw-bg-gradient-to-tr tw-from-purple-600 tw-to-purple-400 tw-clip-border tw-rounded-xl tw-shadow-lg tw-shadow-purple-500/40 tw-grid tw-place-items-center tw-h-16 tw-w-16">
                <CheckCircleIcon />
              </div>
              <div className="tw-p-6 tw-text-right">
                <h4 className="tw-block tw-antialiased tw-tracking-normal tw-font-sans tw-text-2xl tw-font-semibold tw-leading-snup tw-text-blue-gray-900">
                  {stats.inProcessOrders}
                </h4>
                <p className="tw-block tw-antialiased tw-font-sans tw-text-sm tw-leading-normal tw-font-normal tw-text-blue-gray-600">
                  In Process
                </p>
              </div>
            </div>
          </div>

          {/* Recent Orders Table */}
          <div className="tw-bg-white tw-border tw-border-blue-gray-100 tw-shadow-sm tw-rounded-xl tw-overflow-hidden">
            <div className="tw-px-6 tw-py-4 tw-border-b tw-border-blue-gray-100">
              <h3 className="tw-text-lg tw-font-semibold tw-text-blue-gray-900">Recent Orders</h3>
            </div>
            
            <div className="tw-overflow-x-auto">
              <table className="tw-table-auto tw-text-left tw-w-full tw-min-w-max">
                <thead>
                  <tr className="tw-bg-blue-gray-50">
                    <th className="tw-px-6 tw-py-3 tw-text-xs tw-font-bold tw-text-blue-gray-600 tw-uppercase tw-tracking-wide tw-border-b tw-border-blue-gray-200">
                      Order ID
                    </th>
                    <th className="tw-px-6 tw-py-3 tw-text-xs tw-font-bold tw-text-blue-gray-600 tw-uppercase tw-tracking-wide tw-border-b tw-border-blue-gray-200">
                      Date
                    </th>
                    <th className="tw-px-6 tw-py-3 tw-text-xs tw-font-bold tw-text-blue-gray-600 tw-uppercase tw-tracking-wide tw-border-b tw-border-blue-gray-200">
                      Company
                    </th>
                    <th className="tw-px-6 tw-py-3 tw-text-xs tw-font-bold tw-text-blue-gray-600 tw-uppercase tw-tracking-wide tw-border-b tw-border-blue-gray-200">
                      Status
                    </th>
                    <th className="tw-px-6 tw-py-3 tw-text-xs tw-font-bold tw-text-blue-gray-600 tw-uppercase tw-tracking-wide tw-border-b tw-border-blue-gray-200">
                      Total
                    </th>
                    <th className="tw-px-6 tw-py-3 tw-text-xs tw-font-bold tw-text-blue-gray-600 tw-uppercase tw-tracking-wide tw-border-b tw-border-blue-gray-200">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="tw-border-b tw-border-blue-gray-100 hover:tw-bg-blue-gray-50">
                      <td className="tw-px-6 tw-py-4 tw-text-sm tw-font-medium tw-text-blue-gray-900 tw-border-r tw-border-blue-gray-100">
                        #{order.id.slice(-8)}
                      </td>
                      <td className="tw-px-6 tw-py-4 tw-text-sm tw-text-blue-gray-600 tw-border-r tw-border-blue-gray-100">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="tw-px-6 tw-py-4 tw-text-sm tw-text-blue-gray-600 tw-border-r tw-border-blue-gray-100">
                        {order.companies?.[0]?.company_name || 'N/A'}
                      </td>
                      <td className="tw-px-6 tw-py-4 tw-border-r tw-border-blue-gray-100">
                        <span className={`tw-inline-flex tw-px-2 tw-py-1 tw-text-xs tw-font-semibold tw-rounded-full ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="tw-px-6 tw-py-4 tw-text-sm tw-font-medium tw-text-blue-gray-900 tw-border-r tw-border-blue-gray-100">
                        {formatCurrency(order.total_value)}
                      </td>
                      <td className="tw-px-6 tw-py-4 tw-text-sm">
                        <Link 
                          href={`/admin/orders/${order.id}`}
                          className="tw-inline-flex tw-items-center tw-gap-1 tw-text-blue-600 hover:tw-text-blue-800 tw-transition-colors"
                        >
                          <EyeIcon />
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {recentOrders.length === 0 && (
              <div className="tw-p-6 tw-text-center tw-text-blue-gray-500">
                No recent orders found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
