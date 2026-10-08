'use client';

/**
 * ClientOrdersListView — client-side orders table. Forked from the legacy
 * shared OrdersListView; admin has its own (AdminOrdersListView). Differences
 * vs the admin version:
 *   - No "Client" column (it's their own company's orders by definition)
 *   - No company filter chip (RLS scopes everything)
 *   - No Download CSV (admin convenience)
 *   - Drafts are shown only when explicitly filtered (not always-on)
 *   - Invoices an admin approved as billed externally (NetSuite review page)
 *     appear among the orders, read-only, marked "Billed Externally" (owner
 *     2026-10-08). The list is merged and paged here — a company has at
 *     most a few hundred of each.
 */

import { useEffect, useState } from 'react';
import { ORDER_STATUSES } from '../shared/orderDetails/orderDetailsUtils';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Plus, MoreHorizontal, Eye } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { buildOrderSearchOr, matchesSearch, parseSearchDate } from '../../../lib/orderSearch';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';

import { PageHeader } from '../qq/page-header';
import { Card } from '../qq/card';
import { Input } from '../qq/input';
import { Button } from '../qq/button';
import { Alert, AlertDescription } from '../qq/alert';
import { Pagination } from '../qq/pagination';
import { EmptyState } from '../qq/empty-state';
import { StatusBadge } from '../qq/status-badge';
import { displayOrderStatus } from '../../../lib/orderBadges';
import { HoldBadge } from '../shared/OrderBadges';
import { SupportFundBadge } from '../qq/support-fund-badge';
import { Badge } from '../qq/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../qq/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../qq/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../qq/dropdown-menu';

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_value: number;
  support_fund_used: number;
  po_number: string;
  company_id?: string;
}

interface ExternalSale {
  id: string;
  invoiceNumber: string;
  date: string; // YYYY-MM-DD
  total: number;
  supportFund: number;
  credits: number;
}

type Row = { kind: 'order'; at: string; order: Order } | { kind: 'external'; at: string; sale: ExternalSale };

const BILLED_EXTERNALLY = 'Billed Externally';
const STATUS_OPTIONS = [...ORDER_STATUSES, BILLED_EXTERNALLY];
const ALL_STATUSES = '__all__';
const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// An invoice date (YYYY-MM-DD) in the same format as order dates; local noon so it never shifts a day.
const invoiceDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString();

export default function ClientOrdersListView() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [externals, setExternals] = useState<ExternalSale[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Resolve client's company once
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated.');
        const { data, error } = await supabase
          .from('clients')
          .select('company_id')
          .eq('id', user.id)
          .single();
        if (error) throw error;
        if (!data?.company_id) throw new Error('No company linked to your account.');
        // Invoices billed externally — informational, the list works without them.
        try {
          const res = await fetchWithAuth('/api/client/external-sales');
          if (res.ok) setExternals((await res.json()).sales ?? []);
        } catch {
          /* ignore */
        }
        setCompanyId(data.company_id);
      } catch (err: any) {
        setError(err.message || 'Failed to load company.');
        setLoading(false);
      }
    })();
  }, []);

  // Fetch orders whenever filters / page / company change
  useEffect(() => {
    if (!companyId) return;
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, statusFilter]);

  // Debounced search
  useEffect(() => {
    if (!companyId) return;
    const id = setTimeout(() => {
      setCurrentPage(1);
      fetchOrders();
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  async function fetchOrders() {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      if (statusFilter === BILLED_EXTERNALLY) {
        setOrders([]);
        return;
      }
      // Every matching order (a company has at most a few hundred) — the
      // list merges them with invoices billed externally and pages below.
      const all: Order[] = [];
      for (let from = 0; ; from += 1000) {
        let query = supabase.from('orders').select('*').eq('company_id', companyId);
        if (statusFilter) query = query.eq('status', statusFilter);
        if (searchTerm.trim()) {
          const day = parseSearchDate(searchTerm);
          if (day) {
            query = query.gte('created_at', `${day}T00:00:00`).lte('created_at', `${day}T23:59:59`);
          } else {
            // PO / SO / invoice number or amount, OR-ed (lib/orderSearch).
            const filter = buildOrderSearchOr(searchTerm);
            if (filter) query = query.or(filter);
          }
        }
        const { data, error: orderError } = await query
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, from + 999);
        if (orderError) throw orderError;
        all.push(...((data ?? []) as Order[]));
        if (!data || data.length < 1000) break;
      }
      setOrders(all);
    } catch (err: any) {
      setError(err.message || 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }

  const visibleExternals =
    statusFilter && statusFilter !== BILLED_EXTERNALLY
      ? []
      : externals.filter((x) => matchesSearch(searchTerm, { number: x.invoiceNumber, date: x.date, total: x.total }));
  const rows: Row[] = [
    ...orders.map((order): Row => ({ kind: 'order', at: order.created_at, order })),
    // Invoice dates sort with order timestamps at noon UTC, the invoice's day.
    ...visibleExternals.map((sale): Row => ({ kind: 'external', at: `${sale.date}T12:00:00Z`, sale })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const totalOrders = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize));
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showEmpty = !loading && rows.length === 0;

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Orders"
        description="Your company's orders. Click a row to open."
        actions={
          <Link href="/client/orders/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New order
            </Button>
          </Link>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filter row */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search PO/SO/invoice, date, amount…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={statusFilter || ALL_STATUSES}
            onValueChange={(v) => {
              setStatusFilter(v === ALL_STATUSES ? '' : v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        {showEmpty ? (
          <EmptyState
            icon={<Search />}
            title={searchTerm || statusFilter ? 'No orders match your filters' : 'No orders yet'}
            description={
              searchTerm || statusFilter
                ? 'Try a different search or clear the filters.'
                : 'Start a new order to see it here.'
            }
            action={
              searchTerm || statusFilter ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('');
                    setCurrentPage(1);
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Link href="/client/orders/new">
                  <Button size="sm">
                    <Plus className="h-4 w-4" /> New order
                  </Button>
                </Link>
              )
            }
            className="border-0 shadow-none"
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <span className="md:hidden">Order</span>
                    <span className="hidden md:inline">PO number</span>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Support fund used</TableHead>
                  <TableHead className="hidden md:table-cell">Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((row) =>
                  row.kind === 'external' ? (
                    <ExternalSaleRow
                      key={`x-${row.sale.id}`}
                      sale={row.sale}
                      onOpen={() => router.push(`/client/orders/external/${row.sale.id}`)}
                    />
                  ) : (
                    <OrderRow key={row.order.id} order={row.order} onOpen={() => router.push(`/client/orders/${row.order.id}`)} />
                  )
                )}
              </TableBody>
            </Table>

            <div className="border-t border-border px-4">
              <Pagination
                page={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setCurrentPage(1);
                }}
                totalItems={totalOrders}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function OrderRow({ order, onOpen }: { order: Order; onOpen: () => void }) {
  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell className="font-mono text-sm">
        <div className="max-w-[160px] sm:max-w-none">
          <div className="truncate">{order.po_number || order.id.substring(0, 6)}</div>
          <div className="md:hidden mt-1 font-sans">
            <div className="text-[11px] text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          <StatusBadge status={displayOrderStatus(order as any)} />
          <HoldBadge hold={(order as any).hold} />
        </span>
      </TableCell>
      <TableCell
        className={`text-right font-mono text-sm ${order.status === 'Cancelled' ? 'text-muted-foreground line-through' : ''}`}
      >
        {money(order.total_value || 0)}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-right">
        {order.support_fund_used > 0 ? (
          <SupportFundBadge
            percent={Math.round((order.support_fund_used / Math.max(1, order.total_value)) * 100)}
            amount={`$${order.support_fund_used.toFixed(2)}`}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
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
            <DropdownMenuItem onClick={onOpen}>
              <Eye className="h-4 w-4 mr-2" /> View
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

/** An invoice billed externally — read-only, opens its detail page. */
function ExternalSaleRow({ sale, onOpen }: { sale: ExternalSale; onOpen: () => void }) {
  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell className="font-mono text-sm">
        <div className="max-w-[160px] sm:max-w-none">
          <div className="truncate">{sale.invoiceNumber}</div>
          <div className="md:hidden mt-1 font-sans text-[11px] text-muted-foreground">{invoiceDay(sale.date)}</div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">Billed Externally</Badge>
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {money(sale.total)}
        {sale.credits ? (
          <div className="text-[11px] text-muted-foreground font-sans">credit −{money(Math.abs(sale.credits))}</div>
        ) : null}
      </TableCell>
      <TableCell className="hidden lg:table-cell text-right">
        {sale.supportFund > 0 ? (
          <SupportFundBadge
            percent={Math.round((sale.supportFund / Math.max(1, sale.total + sale.supportFund)) * 100)}
            amount={money(sale.supportFund)}
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{invoiceDay(sale.date)}</TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" aria-label="View" onClick={onOpen}>
          <Eye className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
