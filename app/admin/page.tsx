'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import AdminLayout from '../components/AdminLayout';
import Link from 'next/link';
import { generateNetSuiteCSV, downloadCSV, OrderForExport } from '../../lib/csvExport';
import {
  Card,
  CardBody,
  CardHeader,
  Typography,
  Button,
  Chip,
  Spinner,
} from '../components/MaterialTailwind';
import { 
  ShoppingCartIcon, 
  ClockIcon, 
  CogIcon, 
  HandRaisedIcon 
} from '@heroicons/react/24/outline';

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
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-4">
            <Spinner className="h-12 w-12" />
            <Typography variant="h6" color="blue-gray">
              Loading dashboard...
            </Typography>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <Typography variant="h4" color="blue-gray" className="font-bold">
          Dashboard Overview
        </Typography>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Today's Orders */}
          <Card className="border border-blue-gray-100 shadow-sm">
            <CardBody className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-blue-50 rounded-full">
                  <ShoppingCartIcon className="h-8 w-8 text-blue-500" />
                </div>
              </div>
              <Typography variant="h2" color="blue-gray" className="mb-2">
                {stats.todayOrders}
              </Typography>
              <Typography variant="small" color="blue-gray" className="font-medium">
                New Orders Today
              </Typography>
              <Typography variant="small" color="gray" className="mt-1">
                {formatCurrency(stats.todayOrdersValue)}
              </Typography>
            </CardBody>
          </Card>

          {/* Open Orders */}
          <Card className="border border-blue-gray-100 shadow-sm">
            <CardBody className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-orange-50 rounded-full">
                  <ClockIcon className="h-8 w-8 text-orange-500" />
                </div>
              </div>
              <Typography variant="h2" color="blue-gray" className="mb-2">
                {stats.openOrders}
              </Typography>
              <Typography variant="small" color="blue-gray" className="font-medium">
                Open Orders
              </Typography>
            </CardBody>
          </Card>

          {/* In Process Orders */}
          <Card className="border border-blue-gray-100 shadow-sm">
            <CardBody className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-green-50 rounded-full">
                  <CogIcon className="h-8 w-8 text-green-500" />
                </div>
              </div>
              <Typography variant="h2" color="blue-gray" className="mb-2">
                {stats.inProcessOrders}
              </Typography>
              <Typography variant="small" color="blue-gray" className="font-medium">
                Orders In Process
              </Typography>
            </CardBody>
          </Card>

          {/* Welcome Card */}
          <Card className="border border-blue-gray-100 shadow-sm">
            <CardBody className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-purple-50 rounded-full">
                  <HandRaisedIcon className="h-8 w-8 text-purple-500" />
                </div>
              </div>
              <Typography variant="h2" color="blue-gray" className="mb-2">
                HELLO
              </Typography>
              <Typography variant="small" color="blue-gray" className="font-medium">
                Welcome Admin
              </Typography>
            </CardBody>
          </Card>
        </div>

        {/* Recent Orders */}
        <Card className="border border-blue-gray-100 shadow-sm">
          <CardHeader floated={false} shadow={false} className="rounded-none">
            <div className="flex items-center justify-between">
              <Typography variant="h5" color="blue-gray">
                Recent Orders
              </Typography>
              <Link href="/admin/orders">
                <Button variant="text" size="sm" className="flex items-center gap-2">
                  View All
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="h-4 w-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3"
                    />
                  </svg>
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardBody className="overflow-scroll px-0">
            {recentOrders.length > 0 ? (
              <table className="w-full min-w-max table-auto text-left">
                <thead>
                  <tr>
                    <th className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4">
                      <Typography
                        variant="small"
                        color="blue-gray"
                        className="font-normal leading-none opacity-70"
                      >
                        PO Number
                      </Typography>
                    </th>
                    <th className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4">
                      <Typography
                        variant="small"
                        color="blue-gray"
                        className="font-normal leading-none opacity-70"
                      >
                        Company
                      </Typography>
                    </th>
                    <th className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4">
                      <Typography
                        variant="small"
                        color="blue-gray"
                        className="font-normal leading-none opacity-70"
                      >
                        Status
                      </Typography>
                    </th>
                    <th className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4">
                      <Typography
                        variant="small"
                        color="blue-gray"
                        className="font-normal leading-none opacity-70"
                      >
                        Total
                      </Typography>
                    </th>
                    <th className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4">
                      <Typography
                        variant="small"
                        color="blue-gray"
                        className="font-normal leading-none opacity-70"
                      >
                        Date
                      </Typography>
                    </th>
                    <th className="border-y border-blue-gray-100 bg-blue-gray-50/50 p-4">
                      <Typography
                        variant="small"
                        color="blue-gray"
                        className="font-normal leading-none opacity-70"
                      >
                        Actions
                      </Typography>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order, index) => {
                    const isLast = index === recentOrders.length - 1;
                    const classes = isLast ? "p-4" : "p-4 border-b border-blue-gray-50";
                    
                    return (
                      <tr key={order.id}>
                        <td className={classes}>
                          <Typography variant="small" color="blue-gray" className="font-bold">
                            {order.po_number || 'N/A'}
                          </Typography>
                        </td>
                        <td className={classes}>
                          <Typography variant="small" color="blue-gray" className="font-normal">
                            {(() => {
                              const companies = order.companies;
                              if (!companies) return 'N/A';
                              const companyName = Array.isArray(companies) 
                                ? companies[0]?.company_name 
                                : (companies as any).company_name;
                              return companyName || 'N/A';
                            })()}
                          </Typography>
                        </td>
                        <td className={classes}>
                          <Chip
                            size="sm"
                            variant="ghost"
                            value={order.status}
                            color={
                              order.status === 'Open'
                                ? 'orange'
                                : order.status === 'In Process'
                                ? 'blue'
                                : order.status === 'Completed'
                                ? 'green'
                                : 'blue-gray'
                            }
                          />
                        </td>
                        <td className={classes}>
                          <Typography variant="small" color="blue-gray" className="font-medium">
                            {formatCurrency(order.total_value || 0)}
                          </Typography>
                        </td>
                        <td className={classes}>
                          <Typography variant="small" color="blue-gray" className="font-normal">
                            {new Date(order.created_at).toLocaleDateString()}
                          </Typography>
                        </td>
                        <td className={classes}>
                          <div className="flex items-center gap-2">
                            <Link href={`/admin/orders/${order.id}`}>
                              <Button variant="text" size="sm">
                                View
                              </Button>
                            </Link>
                            <Button
                              variant="filled"
                              size="sm"
                              color="blue-gray"
                              onClick={() => handleDownloadCSV(order.id)}
                            >
                              CSV
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center">
                <Typography variant="h6" color="blue-gray" className="mb-2">
                  No orders found
                </Typography>
                <Typography variant="small" color="gray">
                  Orders will appear here once they are created.
                </Typography>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </AdminLayout>
  );
}
