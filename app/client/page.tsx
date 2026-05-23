'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, ShoppingCart, Image as ImageIcon } from 'lucide-react';

import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../lib/formatters';

import HighlightedProductsCarousel from '../components/shared/HighlightedProductsCarousel';

import { PageHeader } from '../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../components/qq/card';
import { Button } from '../components/qq/button';
import { Alert, AlertDescription } from '../components/qq/alert';
import { StatusBadge } from '../components/qq/status-badge';
import { EmptyState } from '../components/qq/empty-state';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/qq/table';

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
}

export default function ClientDashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated.');

        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select(`
            company_id,
            company:companies(id, company_name, netsuite_number)
          `)
          .eq('id', user.id)
          .single();
        if (clientError) throw clientError;

        const companyData = Array.isArray(clientData?.company)
          ? clientData?.company?.[0]
          : clientData?.company;
        setCompany(companyData || null);

        if (clientData?.company_id) {
          const { data: ordersData, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .eq('company_id', clientData.company_id)
            .order('created_at', { ascending: false });
          if (ordersError) throw ordersError;
          setOrders(ordersData || []);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load dashboard.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title={company ? `Welcome, ${company.company_name}` : 'Welcome'}
        description={
          company?.netsuite_number
            ? `NetSuite customer ${company.netsuite_number}`
            : undefined
        }
        actions={
          <Link href="/client/orders/new">
            <Button size="sm">
              <Plus className="h-4 w-4" /> New order
            </Button>
          </Link>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Quick actions + Highlighted products */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">Place a new order</p>
              <p className="text-xs text-muted-foreground mb-3">
                Build a new order with products and support-fund redemption.
              </p>
              <Link href="/client/orders/new">
                <Button size="sm">
                  <Plus className="h-4 w-4" /> New order
                </Button>
              </Link>
            </div>
            <div className="pt-4 border-t border-border">
              <p className="text-sm font-medium mb-1">Your records</p>
              <p className="text-xs text-muted-foreground mb-3">
                Browse order history and your asset library.
              </p>
              <div className="flex gap-2">
                <Link href="/client/orders">
                  <Button variant="outline" size="sm">
                    <ShoppingCart className="h-4 w-4" /> Orders
                  </Button>
                </Link>
                <Link href="/client/assets">
                  <Button variant="outline" size="sm">
                    <ImageIcon className="h-4 w-4" /> Assets
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Featured products</CardTitle>
          </CardHeader>
          <CardContent>
            <HighlightedProductsCarousel />
          </CardContent>
        </Card>
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Recent orders</CardTitle>
            {orders.length > 5 && (
              <Link
                href="/client/orders"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                View all →
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <EmptyState
              title="No orders yet"
              description="Start your first order from the catalog."
              action={
                <Link href="/client/orders/new">
                  <Button size="sm">
                    <Plus className="h-4 w-4" /> New order
                  </Button>
                </Link>
              }
              className="border-0 shadow-none"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell text-right">Total</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Support fund used</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.slice(0, 5).map((order) => (
                  <TableRow
                    key={order.id}
                    onClick={() => router.push(`/client/orders/${order.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="text-sm font-medium">
                      {order.po_number || order.id.substring(0, 8)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right font-mono text-sm">
                      {formatCurrency(order.total_value)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right font-mono text-sm">
                      {formatCurrency(order.support_fund_used)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {new Date(order.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
