'use client';

/**
 * ClientOrdersListView — client-side orders table. Forked from the legacy
 * shared OrdersListView; admin has its own (AdminOrdersListView). Differences
 * vs the admin version:
 *   - No "Client" column (it's their own company's orders by definition)
 *   - No company filter chip (RLS scopes everything)
 *   - No Download CSV (admin convenience)
 *   - Drafts are shown only when explicitly filtered (not always-on)
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Plus, MoreHorizontal, Eye } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';

import { PageHeader } from '../qq/page-header';
import { Card } from '../qq/card';
import { Input } from '../qq/input';
import { Button } from '../qq/button';
import { Alert, AlertDescription } from '../qq/alert';
import { Pagination } from '../qq/pagination';
import { EmptyState } from '../qq/empty-state';
import { StatusBadge } from '../qq/status-badge';
import { SupportFundBadge } from '../qq/support-fund-badge';
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

const STATUS_OPTIONS = ['Draft', 'Open', 'In Process', 'Ready', 'Done', 'Cancelled'] as const;
const ALL_STATUSES = '__all__';

export default function ClientOrdersListView() {
  const router = useRouter();

  const [orders, setOrders] = useState<Order[]>([]);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalOrders, setTotalOrders] = useState(0);

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
  }, [companyId, currentPage, pageSize, statusFilter]);

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
      let query = supabase
        .from('orders')
        .select('*', { count: 'exact' })
        .eq('company_id', companyId);

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      if (searchTerm) {
        const dateMatch = searchTerm.match(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}/);
        if (dateMatch) {
          let dateStr = dateMatch[0];
          if (dateStr.includes('/')) {
            const [m, d, y] = dateStr.split('/');
            dateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          } else if (dateStr.length === 10 && dateStr.split('-')[0].length === 2) {
            const [m, d, y] = dateStr.split('-');
            dateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          }
          query = query
            .gte('created_at', `${dateStr}T00:00:00`)
            .lte('created_at', `${dateStr}T23:59:59`);
        } else {
          const numericValue = parseFloat(searchTerm.replace(/[^0-9.-]/g, ''));
          if (!isNaN(numericValue) && numericValue > 0) {
            query = query
              .gte('total_value', numericValue - 0.01)
              .lte('total_value', numericValue + 0.01);
          } else {
            query = query.ilike('po_number', `%${searchTerm}%`);
          }
        }
      }

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error: orderError, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);
      if (orderError) throw orderError;

      setTotalOrders(count || 0);
      setOrders(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize));
  const showEmpty = !loading && orders.length === 0;

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
            placeholder="Search PO, date, amount…"
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
                {orders.map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/client/orders/${order.id}`)}
                  >
                    <TableCell className="font-mono text-sm">
                      <div className="max-w-[160px] sm:max-w-none">
                        <div className="truncate">
                          {order.po_number || order.id.substring(0, 6)}
                        </div>
                        <div className="md:hidden mt-1 font-sans">
                          <div className="text-[11px] text-muted-foreground">
                            {new Date(order.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
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
                    <TableCell className="hidden lg:table-cell text-right">
                      {order.support_fund_used > 0 ? (
                        <SupportFundBadge
                          percent={Math.round(
                            (order.support_fund_used / Math.max(1, order.total_value)) * 100
                          )}
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
                          <DropdownMenuItem
                            onClick={() => router.push(`/client/orders/${order.id}`)}
                          >
                            <Eye className="h-4 w-4 mr-2" /> View
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
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
