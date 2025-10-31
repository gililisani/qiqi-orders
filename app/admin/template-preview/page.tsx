"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminLayoutWrapper from "@/app/components/template/AdminLayoutWrapper";
import { adminRoutes } from "@/app/config/admin-routes";
import { supabase } from "@/lib/supabaseClient";
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
  Button,
  Spinner,
} from "@material-tailwind/react";
import OrderStatusBadge from "@/app/components/ui/OrderStatusBadge";

const defaultProps = {
  placeholder: undefined,
  onPointerEnterCapture: undefined,
  onPointerLeaveCapture: undefined,
};

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

export default function TemplatePreviewPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    todayOrders: 0,
    todayOrdersValue: 0,
    openOrders: 0,
    inProcessOrders: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

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

      const transformedOrders = orders || [];

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
        inProcessOrders: inProcessOrders.length,
      });

      setRecentOrders(transformedOrders.slice(0, 5));
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayoutWrapper routes={adminRoutes}>
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-4">
            <Spinner className="h-12 w-12" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined} />
            <Typography variant="h6" color="blue-gray" {...defaultProps}>
              Loading dashboard...
            </Typography>
          </div>
        </div>
      </AdminLayoutWrapper>
    );
  }

  return (
    <AdminLayoutWrapper routes={adminRoutes}>
      <div className="mt-8 mb-4">
        <Typography variant="h2" color="blue-gray" className="mb-6" {...defaultProps}>
          Dashboard Overview
        </Typography>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
          {/* Today's Orders */}
          <Card className="border border-blue-gray-100 shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            <CardHeader
              floated={false}
              variant="gradient"
              color="blue"
              className="m-0 mb-4 rounded-b-none p-6 h-28 bg-gradient-to-r from-blue-600 to-blue-400"
              placeholder={undefined}
              onPointerEnterCapture={undefined}
              onPointerLeaveCapture={undefined}
            >
              <Typography variant="h6" color="white" className="font-medium" {...defaultProps}>
                Today's Orders
              </Typography>
              <Typography variant="h2" color="white" {...defaultProps}>
                {stats.todayOrders}
              </Typography>
            </CardHeader>
            <CardBody placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <Typography variant="small" color="gray" className="font-medium" {...defaultProps}>
                {formatCurrency(stats.todayOrdersValue)} total value
              </Typography>
            </CardBody>
          </Card>

          {/* Open Orders */}
          <Card className="border border-blue-gray-100 shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            <CardHeader
              floated={false}
              variant="gradient"
              color="green"
              className="m-0 mb-4 rounded-b-none p-6 h-28 bg-gradient-to-r from-green-600 to-green-400"
              placeholder={undefined}
              onPointerEnterCapture={undefined}
              onPointerLeaveCapture={undefined}
            >
              <Typography variant="h6" color="white" className="font-medium" {...defaultProps}>
                Open Orders
              </Typography>
              <Typography variant="h2" color="white" {...defaultProps}>
                {stats.openOrders}
              </Typography>
            </CardHeader>
            <CardBody placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <Typography variant="small" color="gray" className="font-medium" {...defaultProps}>
                Orders awaiting processing
              </Typography>
            </CardBody>
          </Card>

          {/* In Process Orders */}
          <Card className="border border-blue-gray-100 shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            <CardHeader
              floated={false}
              variant="gradient"
              color="orange"
              className="m-0 mb-4 rounded-b-none p-6 h-28 bg-gradient-to-r from-orange-600 to-orange-400"
              placeholder={undefined}
              onPointerEnterCapture={undefined}
              onPointerLeaveCapture={undefined}
            >
              <Typography variant="h6" color="white" className="font-medium" {...defaultProps}>
                In Process
              </Typography>
              <Typography variant="h2" color="white" {...defaultProps}>
                {stats.inProcessOrders}
              </Typography>
            </CardHeader>
            <CardBody placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <Typography variant="small" color="gray" className="font-medium" {...defaultProps}>
                Orders being processed
              </Typography>
            </CardBody>
          </Card>
        </div>

        {/* Recent Orders Table */}
        <Card className="border border-blue-gray-100 shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
          <CardHeader
            floated={false}
            shadow={false}
            className="rounded-none"
            placeholder={undefined}
            onPointerEnterCapture={undefined}
            onPointerLeaveCapture={undefined}
          >
            <div className="flex items-center justify-between">
              <Typography variant="h5" color="blue-gray" {...defaultProps}>
                Recent Orders
              </Typography>
              <Link href="/admin/orders">
                <Button variant="text" size="sm" className="flex items-center gap-2" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
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
          <CardBody className="overflow-x-scroll px-0 pt-0 pb-2" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            {recentOrders.length > 0 ? (
              <table className="w-full min-w-[640px] table-auto">
                <thead>
                  <tr>
                    {["PO Number", "Company", "Status", "Total", "Date", "Actions"].map((el) => (
                      <th
                        key={el}
                        className="border-b border-blue-gray-50 py-3 px-5 text-left"
                      >
                        <Typography
                          variant="small"
                          className="text-[11px] font-bold uppercase text-blue-gray-400"
                          {...defaultProps}
                        >
                          {el}
                        </Typography>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order, index) => {
                    const className = `py-3 px-5 ${
                      index === recentOrders.length - 1
                        ? ""
                        : "border-b border-blue-gray-50"
                    }`;
                    
                    return (
                      <tr 
                        key={order.id}
                        onClick={() => router.push(`/admin/orders/${order.id}`)}
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className={className}>
                          <Typography
                            variant="small"
                            color="blue-gray"
                            className="font-semibold"
                            {...defaultProps}
                          >
                            {order.po_number || 'N/A'}
                          </Typography>
                        </td>
                        <td className={className}>
                          <Typography
                            variant="small"
                            color="blue-gray"
                            className="font-semibold"
                            {...defaultProps}
                          >
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
                        <td className={className}>
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className={className}>
                          <Typography className="text-xs font-semibold text-blue-gray-600" {...defaultProps}>
                            {formatCurrency(order.total_value || 0)}
                          </Typography>
                        </td>
                        <td className={className}>
                          <Typography className="text-xs font-semibold text-blue-gray-600" {...defaultProps}>
                            {new Date(order.created_at).toLocaleDateString()}
                          </Typography>
                        </td>
                        <td className={className} onClick={(e) => e.stopPropagation()}>
                          <Link href={`/admin/orders/${order.id}`}>
                            <Typography
                              as="a"
                              className="text-xs font-semibold text-blue-gray-600 cursor-pointer hover:text-blue-500"
                              {...defaultProps}
                            >
                              View
                            </Typography>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center">
                <Typography variant="h6" color="blue-gray" className="mb-2" {...defaultProps}>
                  No orders found
                </Typography>
                <Typography variant="small" color="gray" {...defaultProps}>
                  Orders will appear here once they are created.
                </Typography>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </AdminLayoutWrapper>
  );
}

