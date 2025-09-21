"use client";

import React, { useState, useEffect } from "react";
import { createClientSupabase } from "../../lib/supabaseClient";
import TemplateSidenav from "../../components/TemplateSidenav";
import TemplateNavbar from "../../components/TemplateNavbar";

// @material-tailwind/react
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Typography,
} from "@material-tailwind/react";

// @heroicons/react
import { 
  ShoppingBagIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  ClockIcon
} from "@heroicons/react/24/outline";

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
            <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
              <div className="tw-flex tw-justify-between">
                <CardHeader
                  variant="gradient"
                  color="blue"
                  floated={false}
                  shadow={false}
                  className="tw-absolute !tw-grid tw-h-12 tw-w-12 tw-place-items-center"
                >
                  <ShoppingBagIcon className="tw-w-6 tw-h-6 tw-text-white" />
                </CardHeader>
                <CardBody className="!tw-p-4 tw-text-right">
                  <Typography
                    variant="small"
                    className="!tw-font-normal tw-text-blue-gray-600"
                  >
                    Total Orders
                  </Typography>
                  <Typography variant="h4" color="blue-gray">
                    {stats.totalOrders}
                  </Typography>
                </CardBody>
              </div>
              <CardFooter className="tw-border-t tw-border-blue-gray-50 !tw-p-4">
                <Typography className="!tw-font-normal tw-text-blue-gray-600">
                  <strong className="tw-text-green-500">+12%</strong>
                  &nbsp;from last month
                </Typography>
              </CardFooter>
            </Card>

            {/* Total Revenue */}
            <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
              <div className="tw-flex tw-justify-between">
                <CardHeader
                  variant="gradient"
                  color="green"
                  floated={false}
                  shadow={false}
                  className="tw-absolute !tw-grid tw-h-12 tw-w-12 tw-place-items-center"
                >
                  <CurrencyDollarIcon className="tw-w-6 tw-h-6 tw-text-white" />
                </CardHeader>
                <CardBody className="!tw-p-4 tw-text-right">
                  <Typography
                    variant="small"
                    className="!tw-font-normal tw-text-blue-gray-600"
                  >
                    Total Revenue
                  </Typography>
                  <Typography variant="h4" color="blue-gray">
                    {formatCurrency(stats.totalRevenue)}
                  </Typography>
                </CardBody>
              </div>
              <CardFooter className="tw-border-t tw-border-blue-gray-50 !tw-p-4">
                <Typography className="!tw-font-normal tw-text-blue-gray-600">
                  <strong className="tw-text-green-500">+8%</strong>
                  &nbsp;from last month
                </Typography>
              </CardFooter>
            </Card>

            {/* Total Customers */}
            <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
              <div className="tw-flex tw-justify-between">
                <CardHeader
                  variant="gradient"
                  color="orange"
                  floated={false}
                  shadow={false}
                  className="tw-absolute !tw-grid tw-h-12 tw-w-12 tw-place-items-center"
                >
                  <UserGroupIcon className="tw-w-6 tw-h-6 tw-text-white" />
                </CardHeader>
                <CardBody className="!tw-p-4 tw-text-right">
                  <Typography
                    variant="small"
                    className="!tw-font-normal tw-text-blue-gray-600"
                  >
                    Total Customers
                  </Typography>
                  <Typography variant="h4" color="blue-gray">
                    {stats.totalCustomers}
                  </Typography>
                </CardBody>
              </div>
              <CardFooter className="tw-border-t tw-border-blue-gray-50 !tw-p-4">
                <Typography className="!tw-font-normal tw-text-blue-gray-600">
                  <strong className="tw-text-green-500">+3%</strong>
                  &nbsp;from last month
                </Typography>
              </CardFooter>
            </Card>

            {/* Pending Orders */}
            <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
              <div className="tw-flex tw-justify-between">
                <CardHeader
                  variant="gradient"
                  color="purple"
                  floated={false}
                  shadow={false}
                  className="tw-absolute !tw-grid tw-h-12 tw-w-12 tw-place-items-center"
                >
                  <ClockIcon className="tw-w-6 tw-h-6 tw-text-white" />
                </CardHeader>
                <CardBody className="!tw-p-4 tw-text-right">
                  <Typography
                    variant="small"
                    className="!tw-font-normal tw-text-blue-gray-600"
                  >
                    Pending Orders
                  </Typography>
                  <Typography variant="h4" color="blue-gray">
                    {stats.pendingOrders}
                  </Typography>
                </CardBody>
              </div>
              <CardFooter className="tw-border-t tw-border-blue-gray-50 !tw-p-4">
                <Typography className="!tw-font-normal tw-text-blue-gray-600">
                  <strong className="tw-text-orange-500">-2%</strong>
                  &nbsp;from last month
                </Typography>
              </CardFooter>
            </Card>
          </div>

          {/* Recent Orders Table */}
          <Card className="tw-mb-6 tw-border tw-border-blue-gray-100 tw-shadow-sm">
            <div className="tw-flex tw-items-center">
              <CardHeader
                floated={false}
                variant="gradient"
                color="gray"
                className="tw-grid tw-h-16 tw-w-16 tw-place-items-center"
              >
                <ShoppingBagIcon className="tw-h-7 tw-w-7 tw-text-white" />
              </CardHeader>
              <Typography variant="h6" color="blue-gray" className="tw-mt-3">
                Recent Orders
              </Typography>
            </div>
            <CardBody className="tw-overflow-x-auto">
              <table className="tw-w-full tw-min-w-max tw-table-auto">
                <thead>
                  <tr className="tw-border-b tw-border-blue-gray-200">
                    <th className="tw-py-3 tw-px-4 tw-text-left">
                      <Typography className="tw-text-xs tw-font-medium tw-capitalize tw-text-blue-gray-500">
                        Order Number
                      </Typography>
                    </th>
                    <th className="tw-py-3 tw-px-4 tw-text-left">
                      <Typography className="tw-text-xs tw-font-medium tw-capitalize tw-text-blue-gray-500">
                        Company
                      </Typography>
                    </th>
                    <th className="tw-py-3 tw-px-4 tw-text-center">
                      <Typography className="tw-text-xs tw-font-medium tw-capitalize tw-text-blue-gray-500">
                        Status
                      </Typography>
                    </th>
                    <th className="tw-py-3 tw-px-4 tw-text-center">
                      <Typography className="tw-text-xs tw-font-medium tw-capitalize tw-text-blue-gray-500">
                        Amount
                      </Typography>
                    </th>
                    <th className="tw-py-3 tw-px-4 tw-text-center">
                      <Typography className="tw-text-xs tw-font-medium tw-capitalize tw-text-blue-gray-500">
                        Date
                      </Typography>
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
                        <Typography
                          variant="small"
                          color="blue-gray"
                          className="!tw-font-normal"
                        >
                          {order.order_number}
                        </Typography>
                      </td>
                      <td className="tw-py-3 tw-px-4">
                        <Typography
                          variant="small"
                          color="blue-gray"
                          className="!tw-font-normal"
                        >
                          {order.company?.name || 'N/A'}
                        </Typography>
                      </td>
                      <td className="tw-py-3 tw-px-4 tw-text-center">
                        <span className={`tw-inline-flex tw-items-center tw-px-2.5 tw-py-0.5 tw-rounded-full tw-text-xs tw-font-medium ${getStatusColor(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="tw-py-3 tw-px-4 tw-text-center">
                        <Typography
                          variant="small"
                          color="blue-gray"
                          className="!tw-font-normal"
                        >
                          {formatCurrency(order.total_amount)}
                        </Typography>
                      </td>
                      <td className="tw-py-3 tw-px-4 tw-text-center">
                        <Typography
                          variant="small"
                          color="blue-gray"
                          className="!tw-font-normal"
                        >
                          {new Date(order.created_at).toLocaleDateString()}
                        </Typography>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
