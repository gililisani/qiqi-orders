'use client';

/**
 * Admin Dashboard.
 *
 * Stats tiles up top + recent orders table. Stats reflect the actual
 * order workflow stages (This Month / Open / In Process / Ready) so admins
 * can see at a glance what needs attention. The workflow tiles are
 * clickable and filter the orders table below to that status.
 */

import { useEffect, useState } from 'react';
import { formatCurrencyWhole } from '../../lib/formatters';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Inbox,
  Plus,
  Download,
  Eye,
  MoreHorizontal,
  X,
} from 'lucide-react';

import { supabase } from '../../lib/supabaseClient';

import { PageHeader } from '../components/qq/page-header';
import { Card, CardContent } from '../components/qq/card';
import { Button } from '../components/qq/button';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/qq/dropdown-menu';
import { useToast } from '../components/ui/ToastProvider';

interface RecentOrder {
  id: string;
  created_at: string;
  total_value: number;
  status: string;
  po_number: string;
  company_id: string | null;
  companies: { company_name: string }[] | { company_name: string } | null;
}

interface DashboardStats {
  monthCount: number;
  monthValue: number;
  open: number;
  inProcess: number;
  ready: number;
}

const ZERO_STATS: DashboardStats = {
  monthCount: 0,
  monthValue: 0,
  open: 0,
  inProcess: 0,
  ready: 0,
};

/** Tolerant status comparison — trims and ignores case. */
function statusIs(status: string | null | undefined, expected: string): boolean {
  return (status || '').trim().toLowerCase() === expected.trim().toLowerCase();
}

function companyNameOf(order: RecentOrder): string {
  const c = order.companies;
  if (!c) return '—';
  if (Array.isArray(c)) return c[0]?.company_name || '—';
  return c.company_name || '—';
}

export default function AdminDashboard() {
  const router = useRouter();
  const toast = useToast();
  const [stats, setStats] = useState<DashboardStats>(ZERO_STATS);
  const [allOrders, setAllOrders] = useState<RecentOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only fetch; fn identity changes every render
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

      const { data: orders, error } = await supabase
        .from('orders')
        .select(`id, created_at, total_value, status, po_number, company_id, companies(company_name)`)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const all = (orders || []) as unknown as RecentOrder[];

      // Month totals count real sales only — drafts and cancelled excluded.
      const monthOrders = all.filter(
        (o) =>
          o.created_at.slice(0, 7) === thisMonth &&
          !statusIs(o.status, 'Draft') &&
          !statusIs(o.status, 'Cancelled')
      );
      const monthValue = monthOrders.reduce((sum, o) => sum + (o.total_value || 0), 0);

      setStats({
        monthCount: monthOrders.length,
        monthValue,
        open: all.filter((o) => statusIs(o.status, 'Open')).length,
        inProcess: all.filter((o) => statusIs(o.status, 'In Process')).length,
        ready: all.filter((o) => statusIs(o.status, 'Ready')).length,
      });

      setAllOrders(all);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      toast.error('Could not load dashboard data.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadCSV(orderId: string) {
    try {
      const { generateNetSuiteCSV, downloadCSV } = await import('../../lib/csvExport');
      const { data: orderData, error } = await supabase
        .from('orders')
        .select(`
          *,
          company:companies(company_name, netsuite_number, class:classes(name), subsidiary:subsidiaries(name), location:Locations(location_name)),
          order_items(quantity, unit_price, total_price, product:Products(sku, item_name, netsuite_name))
        `)
        .eq('id', orderId)
        .single();
      if (error) throw error;
      if (!orderData?.company) throw new Error('Company not found.');
      if (!orderData.order_items?.length) throw new Error('No order items found.');
      const csv = generateNetSuiteCSV(orderData as any);
      const date = new Date(orderData.created_at).toISOString().split('T')[0];
      const po = orderData.po_number || orderData.id.substring(0, 6);
      downloadCSV(csv, `Order_${po}_${date}.csv`);
      toast.success('CSV downloaded.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to export CSV.');
    }
  }

  function toggleFilter(status: string) {
    setStatusFilter((current) => (current === status ? null : status));
  }

  const displayedOrders = statusFilter
    ? allOrders.filter((o) => statusIs(o.status, statusFilter))
    : allOrders.slice(0, 5);

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Dashboard"
        description="Quick overview of order activity."
        actions={
          <Link href="/admin/orders/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New order
            </Button>
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Stat
          label="This Month"
          value={loading ? '—' : formatCurrencyWhole(stats.monthValue)}
          delta={loading ? undefined : `${stats.monthCount} order${stats.monthCount === 1 ? '' : 's'}`}
        />
        <Stat
          label="Open"
          value={loading ? '—' : String(stats.open)}
          delta={loading ? undefined : 'Awaiting push to NetSuite'}
          onClick={loading ? undefined : () => toggleFilter('Open')}
          active={statusFilter === 'Open'}
        />
        <Stat
          label="In Process"
          value={loading ? '—' : String(stats.inProcess)}
          delta={loading ? undefined : 'Pushed, awaiting invoice'}
          onClick={loading ? undefined : () => toggleFilter('In Process')}
          active={statusFilter === 'In Process'}
        />
        <Stat
          label="Ready"
          value={loading ? '—' : String(stats.ready)}
          delta={loading ? undefined : 'Invoice created'}
          onClick={loading ? undefined : () => toggleFilter('Ready')}
          active={statusFilter === 'Ready'}
        />
      </div>

      {/* Recent / filtered orders */}
      <Card>
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">
            {statusFilter ? `${statusFilter} orders (${displayedOrders.length})` : 'Recent orders'}
          </h2>
          {statusFilter ? (
            <Button variant="ghost" size="sm" onClick={() => setStatusFilter(null)}>
              <X className="h-4 w-4" />
              Clear filter
            </Button>
          ) : (
            <Link href="/admin/orders">
              <Button variant="ghost" size="sm">
                View all
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>

        {loading ? (
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Loading recent orders…
          </CardContent>
        ) : displayedOrders.length === 0 ? (
          statusFilter ? (
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No {statusFilter.toLowerCase()} orders right now.
            </CardContent>
          ) : (
            <EmptyState
              icon={<Inbox />}
              title="No orders yet"
              description="When distributors place orders, they'll show up here."
              action={
                <Link href="/admin/orders/new">
                  <Button size="sm">
                    <Plus className="h-4 w-4" />
                    New order
                  </Button>
                </Link>
              }
              className="border-0 shadow-none"
            />
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <span className="md:hidden">Order</span>
                  <span className="hidden md:inline">PO Number</span>
                </TableHead>
                <TableHead className="hidden md:table-cell">Company</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="hidden lg:table-cell">Date</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedOrders.map((order) => (
                <TableRow
                  key={order.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/admin/orders/${order.id}`)}
                >
                  <TableCell className="font-mono text-sm">
                    <div className="max-w-[160px] sm:max-w-none">
                      <div className="truncate">{order.po_number || order.id.substring(0, 6)}</div>
                      <div className="md:hidden mt-1 font-sans">
                        <div className="text-xs text-foreground truncate">{companyNameOf(order)}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">
                    {companyNameOf(order)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={order.status} />
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-sm ${
                      order.status === 'Cancelled' ? 'text-muted-foreground line-through' : ''
                    }`}
                  >
                    ${(order.total_value || 0).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Row actions">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/admin/orders/${order.id}`)}>
                          <Eye className="h-4 w-4 mr-2" /> View
                        </DropdownMenuItem>
                        {order.status !== 'Draft' && (
                          <DropdownMenuItem onClick={() => handleDownloadCSV(order.id)}>
                            <Download className="h-4 w-4 mr-2" /> Download CSV
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Stat tile
// -----------------------------------------------------------------------------
function Stat({
  label,
  value,
  delta,
  onClick,
  active,
}: {
  label: string;
  value: string;
  delta?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <Card className={`p-4 ${active ? 'ring-2 ring-ring' : ''}`}>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={active}
          className="mt-1 text-2xl font-semibold tabular-nums underline decoration-dotted underline-offset-4 hover:decoration-solid cursor-pointer"
        >
          {value}
        </button>
      ) : (
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      )}
      {delta && <p className="mt-1 text-xs text-muted-foreground truncate">{delta}</p>}
    </Card>
  );
}
