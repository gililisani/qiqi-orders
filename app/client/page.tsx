'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import Card from '../components/ui/Card';
import Link from 'next/link';
import OrderStatusBadge from '../components/ui/OrderStatusBadge';
import { formatCurrency } from '../../lib/formatters';
import ContractInfo from '../components/shared/ContractInfo';
import TerritoryList from '../components/shared/TerritoryList';
import NotesView from '../components/shared/NotesView';
import HighlightedProductsCarousel from '../components/shared/HighlightedProductsCarousel';
interface Order {
  id: string;
  po_number: string;
  created_at: string;
  status: string;
  total_value: number;
  support_fund_used: number;
  credit_earned: number;
}

interface Company {
  id: string;
  company_name: string;
  netsuite_number: string;
  support_fund?: { percent: number }[];
}

export default function ClientDashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      // Get user's company info
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select(`
          company_id,
          company:companies(
            id,
            company_name,
            netsuite_number,
            support_fund:support_fund_levels(percent)
          )
        `)
        .eq('id', user.id)
        .single();

      if (clientError) throw clientError;
      console.log('Client data:', clientData);
      console.log('Company data:', clientData?.company);
      console.log('Company type:', typeof clientData?.company);
      console.log('Is array:', Array.isArray(clientData?.company));
      
      // Handle both array and object cases
      const companyData = Array.isArray(clientData?.company) 
        ? clientData?.company?.[0] 
        : clientData?.company;
      setCompany(companyData || null);

      // Get ALL company orders (not just user's orders)
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('company_id', clientData.company_id)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      setOrders(ordersData || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Retry
          </button>
        </div>
    );
  }

  return (
    <div className="space-y-8">
        {/* Welcome Title */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Welcome {company?.company_name || 'Loading...'}
          </h1>
        </div>

        {/* Two Boxes Side by Side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Box: New Order + Order History */}
          <Card>
            <div className="p-6 space-y-6">
              {/* Place New Order */}
              <div>
                <h2 className="text-lg font-semibold mb-4">Place New Order</h2>
                <p className="text-gray-600 mb-4">
                  Create a new order with product selection and support fund redemption.
                </p>
                <Link
                  href="/client/orders/new"
                  className="inline-block bg-black text-white px-6 py-3 rounded hover:opacity-90 transition"
                >
                  New Order
                </Link>
              </div>

              {/* Order History */}
              <div className="border-t border-gray-200 pt-6">
                <h2 className="text-lg font-semibold mb-4">Order History</h2>
                <p className="text-gray-600 mb-4">
                  View all your past and current orders.
                </p>
                <Link
                  href="/client/orders"
                  className="inline-block bg-gray-700 text-white px-6 py-3 rounded hover:opacity-90 transition"
                >
                  View Orders
                </Link>
              </div>
            </div>
          </Card>

          {/* Right Box: Highlighted Products Carousel */}
          <Card>
            <div className="p-6">
              <HighlightedProductsCarousel />
            </div>
          </Card>
        </div>

        {/* Recent Orders */}
        <Card header={<h2 className="font-semibold">Recent Orders</h2>}>
          <div className="overflow-x-auto">
            {orders.length > 0 ? (
              <table className="min-w-full border border-[#e5e5e5] rounded-lg overflow-hidden">
                <thead>
                  <tr className="border-b border-[#e5e5e5]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      PO Number
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Total Value
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Support Fund Used
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 5).map((order) => (
                    <tr 
                      key={order.id} 
                      onClick={() => router.push(`/client/orders/${order.id}`)}
                      className="hover:bg-gray-50 border-b border-[#e5e5e5] cursor-pointer"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {order.po_number || order.id.substring(0, 8)}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <OrderStatusBadge status={order.status} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(order.total_value)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {formatCurrency(order.support_fund_used)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={`/client/orders/${order.id}`}
                            className="text-gray-700 hover:text-gray-900"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No orders found.</p>
                <Link
                  href="/client/orders/new"
                  className="mt-2 inline-block bg-black text-white px-4 py-2 hover:opacity-90 transition"
                >
                  Place Your First Order
                </Link>
              </div>
            )}
          </div>
        </Card>

        {/* Contract Information */}
        {company?.id && (
          <Card>
            <ContractInfo
              companyId={company.id}
              userRole="client"
              showActions={false}
              allowEdit={false}
            />
          </Card>
        )}

        {/* Territories */}
        {company?.id && (
          <Card>
            <TerritoryList
              companyId={company.id}
              userRole="client"
              showActions={false}
              allowEdit={false}
            />
          </Card>
        )}

        {/* Company Notes */}
        {company?.id && (
          <Card>
            <NotesView
              companyId={company.id}
              userRole="client"
              showActions={false}
              allowEdit={false}
              allowDelete={false}
              allowCreate={false}
            />
          </Card>
        )}
      </div>
  );
}