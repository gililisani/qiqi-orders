'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import ClientLayout from '../components/ClientLayout';
import Card from '../components/ui/Card';
import Link from 'next/link';
import OrderStatusBadge from '../components/ui/OrderStatusBadge';
import { formatCurrency } from '../../lib/formatters';
import ChangePasswordModal from '../components/ChangePasswordModal';

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_value: number;
  support_fund_used: number;
  credit_earned: number;
}

interface Company {
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
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(true); // Default true to avoid flash

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      // Get user's company info and password status
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select(`
          company_id,
          password_changed,
          company:companies(
            company_name,
            netsuite_number,
            support_fund:support_fund_levels(percent)
          )
        `)
        .eq('id', user.id)
        .single();

      if (clientError) throw clientError;
      setCompany(clientData?.company?.[0] || null);

      // Check if password needs to be changed
      if (clientData?.password_changed === false) {
        setPasswordChanged(false);
        setShowPasswordModal(true);
      }

      // Get user's orders
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;
      setOrders(ordersData || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChanged = () => {
    setShowPasswordModal(false);
    setPasswordChanged(true);
    // Optionally show success message
    alert('Password changed successfully! Welcome to Qiqi Partners Portal.');
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </ClientLayout>
    );
  }

  if (error) {
    return (
      <ClientLayout>
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
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-8">
        {/* Welcome Section */}
        <Card>
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Qiqi Distributors</h1>
            <p className="text-gray-600">
              Manage your orders and place new ones for {company?.company_name || 'your company'}.
            </p>
            {company?.support_fund && company.support_fund.length > 0 && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200">
                <p className="text-sm text-green-800">
                  <strong>Support Fund:</strong> You have {company.support_fund[0].percent}% support fund available for each order.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Place New Order</h2>
              <p className="text-gray-600 mb-4">
                Create a new order with product selection and support fund redemption.
              </p>
              <Link
                href="/client/orders/new"
                className="inline-block bg-black text-white px-6 py-3 hover:opacity-90 transition"
              >
                New Order
              </Link>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Order History</h2>
              <p className="text-gray-600 mb-4">
                View all your past and current orders.
              </p>
              <Link
                href="/client/orders"
                className="inline-block bg-gray-700 text-white px-6 py-3 hover:opacity-90 transition"
              >
                View Orders
              </Link>
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
                      Order ID
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
                            {order.id.substring(0, 8)}...
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
      </div>

      {/* Password Change Modal - shows on first login */}
      {showPasswordModal && !passwordChanged && (
        <ChangePasswordModal onPasswordChanged={handlePasswordChanged} />
      )}
    </ClientLayout>
  );
}