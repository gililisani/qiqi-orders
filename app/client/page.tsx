'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, ShoppingCart, Image as ImageIcon } from 'lucide-react';

import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../lib/formatters';

import { SupportFundGoalStrip } from '../components/client/SupportFundGoalStrip';
import { ActivityFeed } from '../components/client/ActivityFeed';
import { HomeNewsBox, type HomeSettings } from '../components/client/HomeNewsBox';
import { invoiceInfo } from '../../lib/clientInvoices';

import { PageHeader } from '../components/qq/page-header';
import { AnnouncementsRail } from '../components/client/AnnouncementsRail';
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
  // NetSuite-synced invoice fields used by the outstanding balance badge.
  invoice_number?: string | null;
  invoice_amount_remaining?: number | null;
  invoice_due_date?: string | null;
  netsuite_invoice_status?: string | null;
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
  const [homeSettings, setHomeSettings] = useState<HomeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated.');

        // News-box mode (admin-controlled). Failure = box hidden.
        supabase
          .from('client_home_settings')
          .select('*')
          .eq('id', 1)
          .maybeSingle()
          .then(({ data }) => setHomeSettings((data as HomeSettings) ?? null));

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

      <OutstandingBalanceBadge orders={orders} />

      <SupportFundGoalStrip />

      {/* Activity feed + admin-controlled news box. Mode "nothing" hides
          the box and the feed takes the full width (owner spec). */}
      <div
        className={`grid grid-cols-1 gap-4 items-stretch ${
          homeSettings && homeSettings.news_mode !== 'nothing' ? 'md:grid-cols-2' : ''
        }`}
      >
        <ActivityFeed />
        {homeSettings && homeSettings.news_mode !== 'nothing' && (
          <HomeNewsBox settings={homeSettings} />
        )}
      </div>

      {/* Live announcements — always visible when there are any, independent
          of the news-box mode above (they used to compete for one slot). */}
      <AnnouncementsRail />

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

// ---------------------------------------------------------------------------
// Outstanding balance badge — aggregates invoice_amount_remaining across
// orders that have an invoice with a non-zero open balance. Stays out of
// the way when everything's paid.
// ---------------------------------------------------------------------------
function OutstandingBalanceBadge({ orders }: { orders: Order[] }) {
  let totalOutstanding = 0;
  let overdueOutstanding = 0;
  let outstandingCount = 0;
  let overdueCount = 0;
  const now = Date.now();

  for (const o of orders) {
    if (!o.invoice_number) continue;
    // Shared best-known-balance logic — same math as the Billing page.
    const info = invoiceInfo(o, now);
    if (info.remaining == null || info.remaining <= 0.005) continue;

    totalOutstanding += info.remaining;
    outstandingCount += 1;
    if (info.overdue) {
      overdueOutstanding += info.remaining;
      overdueCount += 1;
    }
  }

  if (outstandingCount === 0) {
    return null; // nothing outstanding — don't clutter the dashboard
  }

  const isOverdue = overdueCount > 0;
  return (
    <Card
      className={
        isOverdue ? 'border-rose-200 bg-rose-50/40' : 'border-amber-200 bg-amber-50/40'
      }
    >
      <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Outstanding balance
          </p>
          <p
            className={`mt-0.5 text-2xl font-semibold font-mono tabular-nums ${
              isOverdue ? 'text-rose-700' : 'text-amber-700'
            }`}
          >
            {formatCurrency(totalOutstanding)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Across {outstandingCount} invoice{outstandingCount === 1 ? '' : 's'}
            {overdueCount > 0 && (
              <>
                {' '}·{' '}
                <span className="text-rose-700 font-medium">
                  {formatCurrency(overdueOutstanding)} overdue ({overdueCount})
                </span>
              </>
            )}
          </p>
        </div>
        <Link href="/client/billing">
          <Button variant="outline" size="sm">
            View billing
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
