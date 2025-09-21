"use client";

import React, { useState, useEffect } from "react";
import { createClientSupabase } from "../../../lib/supabaseClient";
import TemplateSidenav from "../../components/TemplateSidenav";
import TemplateNavbar from "../../components/TemplateNavbar";

interface Order {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  company?: {
    name: string;
  };
}

interface Stats {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  pendingOrders: number;
}

export default function TemplateDashboard() {
  const [openSidenav, setOpenSidenav] = useState(false);
  const [stats, setStats] = useState<Stats>({
    totalOrders: 0,
    totalRevenue: 0,
    totalCustomers: 0,
    pendingOrders: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const supabase = createClientSupabase();

      // Fetch statistics
      const [ordersResult, companiesResult] = await Promise.all([
        supabase.from('orders').select('*'),
        supabase.from('companies').select('*')
      ]);

      if (ordersResult.data) {
        const orders = ordersResult.data;
        const totalRevenue = orders.reduce((sum, order) => sum + (order.total_amount || 0), 0);
        const pendingOrders = orders.filter(order => order.status === 'pending').length;

        setStats({
          totalOrders: orders.length,
          totalRevenue,
          totalCustomers: companiesResult.data?.length || 0,
          pendingOrders,
        });

        // Fetch recent orders with company data
        const recentOrdersResult = await supabase
          .from('orders')
          .select(`
            *,
            companies(name)
          `)
          .order('created_at', { ascending: false })
          .limit(5);

        setRecentOrders(recentOrdersResult.data as any || []);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'tw-bg-green-100 tw-text-green-800';
      case 'pending':
        return 'tw-bg-yellow-100 tw-text-yellow-800';
      case 'processing':
        return 'tw-bg-blue-100 tw-text-blue-800';
      case 'cancelled':
        return 'tw-bg-red-100 tw-text-red-800';
      default:
        return 'tw-bg-gray-100 tw-text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="tw-min-h-screen tw-bg-blue-gray-50/50">
        <div className="tw-flex tw-items-center tw-justify-center tw-h-screen">
          <div className="tw-animate-spin tw-rounded-full tw-h-32 tw-w-32 tw-border-b-2 tw-border-blue-gray-900"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="tw-min-h-screen tw-bg-blue-gray-50/50">
      {/* Sidenav */}
      <TemplateSidenav 
        openSidenav={openSidenav} 
        setOpenSidenav={setOpenSidenav} 
      />

      {/* Main Content */}
      <div className="tw-p-4 xl:tw-ml-80">
        {/* Navbar */}
        <TemplateNavbar
          openSidenav={openSidenav}
          setOpenSidenav={setOpenSidenav}
        />
        <div className="tw-mt-8 tw-mb-4">
          
          {/* Statistics Cards */}
          <div className="tw-my-6 tw-grid tw-gap-6 md:tw-grid-cols-2 xl:tw-grid-cols-4">
            
            {/* Total Orders */}
            <div className="tw-border tw-border-blue-gray-100 tw-shadow-sm tw-rounded-xl tw-bg-white tw-overflow-hidden">
              <div className="tw-flex tw-justify-between tw-relative">
                <div className="tw-absolute tw-grid tw-h-12 tw-w-12 tw-place-items-center tw-m-4 tw-rounded-lg tw-bg-gradient-to-tr tw-from-blue-600 tw-to-blue-400">
                  <svg className="tw-w-6 tw-h-6 tw-text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <div className="tw-p-4 tw-text-right tw-ml-16">
                  <p className="tw-text-xs tw-font-normal tw-text-blue-gray-600 tw-mb-1">
                    Total Orders
                  </p>
                  <h4 className="tw-text-2xl tw-font-bold tw-text-blue-gray-900">
                    {stats.totalOrders}
                  </h4>
                </div>
              </div>
              <div className="tw-border-t tw-border-blue-gray-50 tw-p-4">
                <p className="tw-text-xs tw-font-normal tw-text-blue-gray-600">
                  <strong className="tw-text-green-500">+12%</strong>
                  &nbsp;from last month
                </p>
              </div>
            </div>

            {/* Total Revenue */}
            <div className="tw-border tw-border-blue-gray-100 tw-shadow-sm tw-rounded-xl tw-bg-white tw-overflow-hidden">
              <div className="tw-flex tw-justify-between tw-relative">
                <div className="tw-absolute tw-grid tw-h-12 tw-w-12 tw-place-items-center tw-m-4 tw-rounded-lg tw-bg-gradient-to-tr tw-from-green-600 tw-to-green-400">
                  <svg className="tw-w-6 tw-h-6 tw-text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
                <div className="tw-p-4 tw-text-right tw-ml-16">
                  <p className="tw-text-xs tw-font-normal tw-text-blue-gray-600 tw-mb-1">
                    Total Revenue
                  </p>
                  <h4 className="tw-text-2xl tw-font-bold tw-text-blue-gray-900">
                    {formatCurrency(stats.totalRevenue)}
                  </h4>
                </div>
              </div>
              <div className="tw-border-t tw-border-blue-gray-50 tw-p-4">
                <p className="tw-text-xs tw-font-normal tw-text-blue-gray-600">
                  <strong className="tw-text-green-500">+8%</strong>
                  &nbsp;from last month
                </p>
              </div>
            </div>

            {/* Total Customers */}
            <div className="tw-border tw-border-blue-gray-100 tw-shadow-sm tw-rounded-xl tw-bg-white tw-overflow-hidden">
              <div className="tw-flex tw-justify-between tw-relative">
                <div className="tw-absolute tw-grid tw-h-12 tw-w-12 tw-place-items-center tw-m-4 tw-rounded-lg tw-bg-gradient-to-tr tw-from-orange-600 tw-to-orange-400">
                  <svg className="tw-w-6 tw-h-6 tw-text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="tw-p-4 tw-text-right tw-ml-16">
                  <p className="tw-text-xs tw-font-normal tw-text-blue-gray-600 tw-mb-1">
                    Total Customers
                  </p>
                  <h4 className="tw-text-2xl tw-font-bold tw-text-blue-gray-900">
                    {stats.totalCustomers}
                  </h4>
                </div>
              </div>
              <div className="tw-border-t tw-border-blue-gray-50 tw-p-4">
                <p className="tw-text-xs tw-font-normal tw-text-blue-gray-600">
                  <strong className="tw-text-green-500">+3%</strong>
                  &nbsp;from last month
                </p>
              </div>
            </div>

            {/* Pending Orders */}
            <div className="tw-border tw-border-blue-gray-100 tw-shadow-sm tw-rounded-xl tw-bg-white tw-overflow-hidden">
              <div className="tw-flex tw-justify-between tw-relative">
                <div className="tw-absolute tw-grid tw-h-12 tw-w-12 tw-place-items-center tw-m-4 tw-rounded-lg tw-bg-gradient-to-tr tw-from-purple-600 tw-to-purple-400">
                  <svg className="tw-w-6 tw-h-6 tw-text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="tw-p-4 tw-text-right tw-ml-16">
                  <p className="tw-text-xs tw-font-normal tw-text-blue-gray-600 tw-mb-1">
                    Pending Orders
                  </p>
                  <h4 className="tw-text-2xl tw-font-bold tw-text-blue-gray-900">
                    {stats.pendingOrders}
                  </h4>
                </div>
              </div>
              <div className="tw-border-t tw-border-blue-gray-50 tw-p-4">
                <p className="tw-text-xs tw-font-normal tw-text-blue-gray-600">
                  <strong className="tw-text-orange-500">-2%</strong>
                  &nbsp;from last month
                </p>
              </div>
            </div>
          </div>

          {/* Recent Orders Table */}
          <div className="tw-mb-6 tw-border tw-border-blue-gray-100 tw-shadow-sm tw-rounded-xl tw-bg-white tw-overflow-hidden">
            <div className="tw-flex tw-items-center tw-p-6">
              <div className="tw-grid tw-h-16 tw-w-16 tw-place-items-center tw-rounded-lg tw-bg-gradient-to-tr tw-from-gray-600 tw-to-gray-400 tw-mr-4">
                <svg className="tw-h-7 tw-w-7 tw-text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <h6 className="tw-text-lg tw-font-semibold tw-text-blue-gray-900">
                Recent Orders
              </h6>
            </div>
            <div className="tw-overflow-x-auto tw-p-6">
              <table className="tw-w-full tw-min-w-max tw-table-auto">
                <thead>
                  <tr className="tw-border-b tw-border-blue-gray-200">
                    <th className="tw-py-3 tw-px-4 tw-text-left">
                      <p className="tw-text-xs tw-font-medium tw-capitalize tw-text-blue-gray-500">
                        Order Number
                      </p>
                    </th>
                    <th className="tw-py-3 tw-px-4 tw-text-left">
                      <p className="tw-text-xs tw-font-medium tw-capitalize tw-text-blue-gray-500">
                        Company
                      </p>
                    </th>
                    <th className="tw-py-3 tw-px-4 tw-text-center">
                      <p className="tw-text-xs tw-font-medium tw-capitalize tw-text-blue-gray-500">
                        Status
                      </p>
                    </th>
                    <th className="tw-py-3 tw-px-4 tw-text-center">
                      <p className="tw-text-xs tw-font-medium tw-capitalize tw-text-blue-gray-500">
                        Amount
                      </p>
                    </th>
                    <th className="tw-py-3 tw-px-4 tw-text-center">
                      <p className="tw-text-xs tw-font-medium tw-capitalize tw-text-blue-gray-500">
                        Date
                      </p>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="tw-border-b tw-border-blue-gray-50 hover:tw-bg-blue-gray-50"
                    >
                      <td className="tw-py-3 tw-px-4">
                        <p className="tw-text-sm tw-font-normal tw-text-blue-gray-900">
                          {order.order_number}
                        </p>
                      </td>
                      <td className="tw-py-3 tw-px-4">
                        <p className="tw-text-sm tw-font-normal tw-text-blue-gray-900">
                          {order.company?.name || 'N/A'}
                        </p>
                      </td>
                      <td className="tw-py-3 tw-px-4 tw-text-center">
                        <span className={`tw-inline-flex tw-items-center tw-px-2.5 tw-py-0.5 tw-rounded-full tw-text-xs tw-font-medium ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="tw-py-3 tw-px-4 tw-text-center">
                        <p className="tw-text-sm tw-font-normal tw-text-blue-gray-900">
                          {formatCurrency(order.total_amount)}
                        </p>
                      </td>
                      <td className="tw-py-3 tw-px-4 tw-text-center">
                        <p className="tw-text-sm tw-font-normal tw-text-blue-gray-900">
                          {new Date(order.created_at).toLocaleDateString()}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
