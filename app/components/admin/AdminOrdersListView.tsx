'use client';

/**
 * AdminOrdersListView — admin-only orders table.
 *
 * Forked from app/components/shared/OrdersListView (which still serves
 * /client/orders) so that each side can evolve independently and we no
 * longer carry 30+ `role === 'admin'` conditionals through the file.
 *
 * Architectural cleanup vs the legacy file:
 *  - No more role branching (this file is admin-only).
 *  - Removed the obsolete inline "Create in NetSuite" button — the new
 *    Push to NetSuite flow lives on the order detail page.
 *  - Removed the inline "Mark Complete" button — also handled on the
 *    detail page after invoice creation.
 *  - Row actions consolidated into a dropdown menu (View, Download CSV)
 *    instead of a row of bare links.
 *  - All visual components are qq primitives; native popups replaced by
 *    Alert / toast.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search, Plus, MoreHorizontal, Eye, Download, X } from 'lucide-react';

import { useSupabase } from '../../../lib/supabase-provider';

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
import { useToast } from '../ui/ToastProvider';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
interface Order {
  id: string;
  created_at: string;
  status: string;
  total_value: number;
  support_fund_used: number;
  po_number: string;
  user_id?: string;
  company_id?: string;
  netsuite_so_id?: string | null;
  so_number?: string | null;
}
interface ClientLite { id: string; name: string; email: string }
interface CompanyLite { id: string; company_name: string; netsuite_number: string }

const STATUS_OPTIONS = ['Open', 'In Process', 'Ready', 'Done', 'Cancelled'] as const;
const ALL_STATUSES = '__all__';

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------
export default function AdminOrdersListView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabase } = useSupabase();
  const toast = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [clientsMap, setClientsMap] = useState<Map<string, ClientLite>>(new Map());
  const [companiesMap, setCompaniesMap] = useState<Map<string, CompanyLite>>(new Map());
  const [filteredCompanyName, setFilteredCompanyName] = useState<string | null>(null);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalOrders, setTotalOrders] = useState(0);

  const companyIdFilter = searchParams?.get('company_id') || null;

  // -------------------------------------------------------------------------
  // Resolve filtered-company display name (badge above the filter row)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!companyIdFilter) {
      setFilteredCompanyName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('companies')
        .select('company_name')
        .eq('id', companyIdFilter)
        .single();
      if (!cancelled) setFilteredCompanyName(data?.company_name ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyIdFilter, supabase]);

  // -------------------------------------------------------------------------
  // Fetch orders on every relevant change
  // -------------------------------------------------------------------------
  useEffect(() => {
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, statusFilter, companyIdFilter]);

  // Debounced search — resets to page 1
  useEffect(() => {
    const id = setTimeout(() => {
      setCurrentPage(1);
      fetchOrders();
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  async function fetchOrders() {
    setLoading(true);
    setError('');
    try {
      let query = supabase.from('orders').select('*', { count: 'exact' });

      if (companyIdFilter) {
        query = query.eq('company_id', companyIdFilter);
      }
      if (statusFilter) {
        // Admins always see Drafts even when filtering by another status
        query = query.in('status', [statusFilter, 'Draft']);
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
          query = query.gte('created_at', `${dateStr}T00:00:00`).lte('created_at', `${dateStr}T23:59:59`);
        } else {
          const { data: matchingCompanies } = await supabase
            .from('companies')
            .select('id')
            .ilike('company_name', `%${searchTerm}%`);
          const matchingCompanyIds = matchingCompanies?.map((c: { id: string }) => c.id) || [];
          if (matchingCompanyIds.length > 0) {
            query = query.in('company_id', matchingCompanyIds);
          } else {
            const numericValue = parseFloat(searchTerm.replace(/[^0-9.-]/g, ''));
            if (!isNaN(numericValue) && numericValue > 0) {
              query = query.gte('total_value', numericValue - 0.01).lte('total_value', numericValue + 0.01);
            } else {
              query = query.ilike('po_number', `%${searchTerm}%`);
            }
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

      // Resolve client/company display names in one batch
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((o: Order) => o.user_id).filter(Boolean))] as string[];
        const companyIds = [...new Set(data.map((o: Order) => o.company_id).filter(Boolean))] as string[];
        const [clientsResult, companiesResult] = await Promise.all([
          userIds.length
            ? supabase.from('clients').select('id, name, email').in('id', userIds)
            : Promise.resolve({ data: [] } as any),
          companyIds.length
            ? supabase.from('companies').select('id, company_name, netsuite_number').in('id', companyIds)
            : Promise.resolve({ data: [] } as any),
        ]);
        setClientsMap(new Map((clientsResult.data || []).map((c: ClientLite) => [c.id, c])));
        setCompaniesMap(new Map((companiesResult.data || []).map((c: CompanyLite) => [c.id, c])));
      } else {
        setClientsMap(new Map());
        setCompaniesMap(new Map());
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Row action — Download CSV (admin convenience, no NetSuite involvement)
  // -------------------------------------------------------------------------
  async function handleDownloadCSV(orderId: string) {
    try {
      const { generateNetSuiteCSV, downloadCSV } = await import('../../../lib/csvExport');
      const { data: orderData, error: e } = await supabase
        .from('orders')
        .select(`
          *,
          company:companies(company_name, netsuite_number, class:classes(name), subsidiary:subsidiaries(name), location:Locations(location_name)),
          order_items(quantity, unit_price, total_price, product:Products(sku, item_name, netsuite_name))
        `)
        .eq('id', orderId)
        .single();
      if (e) throw e;
      if (!orderData?.company) throw new Error('Company not found.');
      if (!orderData.order_items?.length) throw new Error('No order items found.');
      for (const item of orderData.order_items) {
        if (!item.product?.sku) throw new Error('Product SKU missing.');
      }
      const csv = generateNetSuiteCSV(orderData as any);
      const date = new Date(orderData.created_at).toISOString().split('T')[0];
      const po = orderData.po_number || orderData.id.substring(0, 6);
      downloadCSV(csv, `Order_${po}_${date}.csv`);
      toast.success('CSV downloaded.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to export CSV.');
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize));
  const showEmpty = !loading && orders.length === 0;

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Orders"
        description="All orders from your distributors. Click any row to open."
        actions={
          <Link href="/admin/orders/new">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New order
            </Button>
          </Link>
        }
      />

      {/* Filter chip if scoped to a company */}
      {companyIdFilter && filteredCompanyName && (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered by:</span>
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-brand-periwinkle/30 bg-brand-periwinkle/10 px-2 py-0.5 text-xs font-medium text-brand-periwinkle">
            {filteredCompanyName}
            <Link href="/admin/orders" aria-label="Clear filter" className="hover:opacity-70">
              <X className="h-3 w-3" />
            </Link>
          </span>
        </div>
      )}

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
            placeholder="Search PO, company, date, amount…"
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
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card>
        {showEmpty ? (
          <EmptyState
            icon={<Search />}
            title={searchTerm || statusFilter ? 'No orders match your filters' : 'No orders yet'}
            description={
              searchTerm || statusFilter
                ? 'Try a different search or clear the filters.'
                : 'When distributors place orders, they\'ll show up here.'
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
                <Link href="/admin/orders/new">
                  <Button size="sm">
                    <Plus className="h-4 w-4" />
                    New order
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
                    {/* Same column holds different content on mobile vs desktop, so the label
                        adapts: "Order" (PO + Company + Client stacked) on mobile, plain
                        "PO Number" on md+ where Client and Company live in their own columns. */}
                    <span className="md:hidden">Order</span>
                    <span className="hidden md:inline">PO Number</span>
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Client</TableHead>
                  <TableHead className="hidden md:table-cell">Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden lg:table-cell">Support fund</TableHead>
                  <TableHead className="hidden lg:table-cell">Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const client = clientsMap.get(order.user_id || '');
                  const company = companiesMap.get(order.company_id || '');
                  return (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer"
                      onClick={(e) => {
                        // Match the browser's anchor behavior for the row click.
                        // Ctrl/Cmd-click opens in a new tab; plain click navigates.
                        if (e.ctrlKey || e.metaKey || e.shiftKey) {
                          window.open(`/admin/orders/${order.id}`, '_blank', 'noopener');
                          return;
                        }
                        router.push(`/admin/orders/${order.id}`);
                      }}
                      onAuxClick={(e) => {
                        // Middle-click → new tab. The browser sends button=1 on aux click.
                        if (e.button === 1) {
                          e.preventDefault();
                          window.open(`/admin/orders/${order.id}`, '_blank', 'noopener');
                        }
                      }}
                    >
                      <TableCell className="font-mono text-sm">
                        {/* Constrain mobile width so a long company name truncates inside
                            the cell instead of pushing the table off-screen. */}
                        <div className="max-w-[160px] sm:max-w-none">
                          {/* Real <a href> on the primary identifier so the browser's
                              native right-click → "Open in new tab" works. The row's
                              onClick still handles plain left-click anywhere else in
                              the row. stopPropagation prevents double-navigation. */}
                          <Link
                            href={`/admin/orders/${order.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate hover:underline"
                          >
                            {order.po_number || order.id.substring(0, 6)}
                          </Link>
                          {/* Mobile-only stacked context: NS number, company, client */}
                          <div className="md:hidden mt-1 font-sans space-y-0.5">
                            {company?.netsuite_number && (
                              <div className="text-[11px] text-muted-foreground font-mono truncate">
                                NS {company.netsuite_number}
                              </div>
                            )}
                            {company?.company_name && (
                              <div className="text-xs text-foreground truncate">{company.company_name}</div>
                            )}
                            {client?.name && (
                              <div className="text-[11px] text-muted-foreground truncate">{client.name}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {client?.name || (order.user_id ? 'Qiqi' : '—')}
                          </span>
                          {client?.email && (
                            <span className="text-xs text-muted-foreground">{client.email}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-col">
                          <span className="text-sm">
                            {company?.company_name || '—'}
                          </span>
                          {company?.netsuite_number && (
                            <span className="text-xs text-muted-foreground font-mono">
                              NS {company.netsuite_number}
                            </span>
                          )}
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
                      <TableCell className="hidden md:table-cell">
                        {order.support_fund_used > 0 ? (
                          <SupportFundBadge
                            percent={Math.round((order.support_fund_used / Math.max(1, order.total_value)) * 100)}
                            amount={`$${order.support_fund_used.toFixed(2)}`}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
                  );
                })}
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
