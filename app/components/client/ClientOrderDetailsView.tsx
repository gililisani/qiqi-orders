'use client';

/**
 * ClientOrderDetailsView — partner-facing read-only view of a single order.
 * Forked from the legacy shared OrderDetailsView; admin has its own
 * AdminOrderDetailsView. The client side is much simpler:
 *   - Read-only items table (no reorder, no admin number editing)
 *   - Read-only totals
 *   - View+download documents only (admin uploads/deletes)
 *   - Read-only history timeline
 *
 * Client actions:
 *   - Edit order   (status: Draft or Open)
 *   - Delete order (status: Draft only)
 *   - View packing slip (status: Ready or Done)
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Edit, Trash2, Package } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { formatCurrency, formatQuantity } from '../../../lib/formatters';
import { cn } from '../../../lib/utils';

import { PageHeader } from '../qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../qq/card';
import { Button } from '../qq/button';
import { Badge } from '../qq/badge';
import { Alert, AlertDescription } from '../qq/alert';
import { Separator } from '../qq/separator';
import { StatusBadge } from '../qq/status-badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../qq/table';

import ClientOrderDocumentsView from './ClientOrderDocumentsView';
import ClientOrderHistoryView from './ClientOrderHistoryView';

import { useToast } from '../ui/ToastProvider';
import { useConfirm } from '../ui/ConfirmProvider';

interface OrderCompany {
  id: string;
  company_name: string;
  ship_to?: string;
  incoterm?: { name: string };
  payment_term?: { name: string };
}

interface Order {
  id: string;
  po_number?: string;
  status: string;
  total_value: number;
  credit_earned: number;
  support_fund_used: number;
  created_at: string;
  company_id: string;
  company?: OrderCompany;
  so_number?: string;
  // NetSuite-synced invoice fields. All optional — populated by admin
  // workflows (push-so, create-invoice, sync-invoice, reconcile-order).
  netsuite_so_id?: string | null;
  netsuite_invoice_id?: string | null;
  invoice_number?: string | null;
  netsuite_invoice_date?: string | null;
  netsuite_invoice_status?: string | null;
  invoice_amount_remaining?: number | null;
  invoice_due_date?: string | null;
  shipping_amount?: number | null;
  payment_status?: string | null;
  stripe_hosted_url?: string | null;
  paid_at?: string | null;
}

interface OrderItem {
  id: string;
  product_id: number;
  case_qty: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_support_fund_item: boolean;
  product?: { sku: string; item_name: string };
}

interface Props {
  orderId: string;
}

export default function ClientOrderDetailsView({ orderId }: Props) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ---- Fetch ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [orderRes, itemsRes] = await Promise.all([
          supabase
            .from('orders')
            .select(
              `*, company:companies(id, company_name, ship_to, incoterm:incoterms(name), payment_term:payment_terms(name))`
            )
            .eq('id', orderId)
            .single(),
          supabase
            .from('order_items')
            .select('*, product:Products(sku, item_name)')
            .eq('order_id', orderId)
            .order('sort_order', { ascending: true, nullsFirst: false }),
        ]);
        if (orderRes.error) throw orderRes.error;
        if (itemsRes.error) throw itemsRes.error;
        if (!cancelled) {
          setOrder(orderRes.data as Order);
          setItems((itemsRes.data as OrderItem[]) || []);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load order.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // ---- Delete (Draft only) ----
  const handleDelete = async () => {
    if (!order) return;
    const ok = await confirm({
      title: 'Delete draft order?',
      description: `This will permanently remove "${order.po_number || order.id.substring(0, 6)}". This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete draft',
      requireExplicitConfirm: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/orders/${orderId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete order.');
      toast.success('Draft deleted.');
      router.push('/client/orders');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete order.');
      setDeleting(false);
    }
  };

  // ---- States ----
  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading order…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="px-6 py-8">
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error || 'Order not found.'}</AlertDescription>
        </Alert>
        <Link href="/client/orders">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back to orders
          </Button>
        </Link>
      </div>
    );
  }

  // Product rule: edit only in Draft/Open; delete only when Cancelled.
  // Drafts must be cancelled first then deleted — cleaner lifecycle and
  // matches the admin and server-side gates.
  const canEdit = order.status === 'Draft' || order.status === 'Open';
  const canDelete = order.status === 'Cancelled';
  const showPackingSlip = ['Ready', 'Done'].includes(order.status);

  // Totals breakdown
  const regularItems = items.filter((i) => !i.is_support_fund_item);
  const supportItems = items.filter((i) => i.is_support_fund_item);
  const regularSubtotal = regularItems.reduce((s, i) => s + (i.total_price || 0), 0);
  const supportSubtotal = supportItems.reduce((s, i) => s + (i.total_price || 0), 0);
  const balance = (order.support_fund_used || 0) - supportSubtotal;
  // Shipping is admin-set; the client sees it (read-only) once present, and the
  // effective total includes it.
  const shippingAmount = order.shipping_amount || 0;
  const effectiveTotal = (order.total_value || 0) + shippingAmount;

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title={`Order ${order.po_number || order.id.substring(0, 6)}`}
        description={order.company?.company_name || undefined}
        actions={
          <>
            <Link href="/client/orders">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            </Link>
            {canEdit && (
              <Link href={`/client/orders/${orderId}/edit`}>
                <Button size="sm">
                  <Edit className="h-4 w-4" />
                  {order.status === 'Draft' ? 'Edit & complete' : 'Edit'}
                </Button>
              </Link>
            )}
            {showPackingSlip && (
              <Link href={`/client/orders/${orderId}/packing-slip`}>
                <Button variant="outline" size="sm">
                  <Package className="h-4 w-4" /> Packing slip
                </Button>
              </Link>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            )}
          </>
        }
      />

      {/* Top info cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Order info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label="Status">
              <StatusBadge status={order.status} />
            </Field>
            <Field label="PO number">
              <span className="font-mono">
                {order.po_number || order.id.substring(0, 8)}
              </span>
            </Field>
            {order.so_number && (
              <Field label="Sales order #">
                {/* Plain text on the client side — clients have no NetSuite
                    access, so deep-linking them in would breach the
                    integration boundary. Will become a "Download SO PDF"
                    link in Phase 3 (RESTlet-based document download). */}
                <span className="font-mono">{order.so_number}</span>
              </Field>
            )}
            <Field label="Created">
              <span>{new Date(order.created_at).toLocaleString()}</span>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Bill to</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label="Company">{order.company?.company_name || '—'}</Field>
            <Field label="Ship to">
              <span className="whitespace-pre-line">
                {order.company?.ship_to || 'Not specified'}
              </span>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label="Total">
              <span className="text-base font-semibold font-mono">
                {formatCurrency(effectiveTotal)}
              </span>
            </Field>
            {shippingAmount > 0 && (
              <Field label="Shipping">
                <span className="font-mono">{formatCurrency(shippingAmount)}</span>
              </Field>
            )}
            <Field label="Credit earned">
              <span className="font-mono text-green-700">
                {formatCurrency(order.credit_earned || 0)}
              </span>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Incoterm">
                <span>{order.company?.incoterm?.name || '—'}</span>
              </Field>
              <Field label="Payment terms">
                <span>{order.company?.payment_term?.name || '—'}</span>
              </Field>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Credit-card payment — Pay Now while pending, Paid badge once settled. */}
      {(order.payment_status === 'pending' || order.payment_status === 'paid') && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Payment</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {order.payment_status === 'paid' ? (
              <div className="flex items-center justify-between">
                <Badge variant="success">Paid in Full</Badge>
                {order.paid_at && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(order.paid_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-muted-foreground">Payment is required to release this order.</span>
                {order.stripe_hosted_url && (
                  <a href={order.stripe_hosted_url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm">Pay Now</Button>
                  </a>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invoice (NetSuite-synced) — only shown when this order has been
          invoiced. Surfaces the document number, status, dates, and
          outstanding balance so the client knows where they stand. */}
      {order.invoice_number && (
        <InvoiceCard order={order} />
      )}

      {/* Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              No items on this order.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden sm:table-cell">SKU</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Cases</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    className={item.is_support_fund_item ? 'bg-green-50/40' : ''}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {item.product?.item_name || '—'}
                        </span>
                        {item.is_support_fund_item && (
                          <Badge variant="success" className="text-[10px]">
                            Support fund
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs">
                      {item.product?.sku || '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatQuantity(item.quantity)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right font-mono text-sm">
                      {formatQuantity(item.case_qty || 0)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm ${
                        item.is_support_fund_item ? 'text-green-700' : ''
                      }`}
                    >
                      {formatCurrency(item.unit_price)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm font-medium ${
                        item.is_support_fund_item ? 'text-green-700' : ''
                      }`}
                    >
                      {formatCurrency(item.total_price)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Totals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Regular items" value={formatCurrency(regularSubtotal)} />
          {supportItems.length > 0 && (
            <>
              <Row
                label="Credit used"
                value={formatCurrency(order.support_fund_used || 0)}
                valueClass="text-green-700"
              />
              <Row
                label="Balance"
                value={formatCurrency(balance)}
                valueClass="text-brand-magenta"
              />
            </>
          )}
          {shippingAmount > 0 && (
            <Row label="Shipping" value={formatCurrency(shippingAmount)} />
          )}
          <Separator />
          <Row
            label="Total order value"
            value={formatCurrency(effectiveTotal)}
            bold
          />
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientOrderDocumentsView orderId={orderId} />
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientOrderHistoryView orderId={orderId} />
        </CardContent>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  bold = false,
  valueClass = '',
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className={bold ? 'font-semibold' : ''}>{label}</span>
      <span className={`font-mono ${bold ? 'font-semibold' : ''} ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoice block — NetSuite-synced data only. No on-demand NS calls here;
// everything we render comes from columns already cached on orders by the
// admin push/sync workflows. Outstanding balance and due date come from the
// NS invoice record (.amountRemaining / .dueDate) — fully reliable for the
// "Paid In Full" case, may be null on legacy orders that haven't been
// re-synced since the migration that added those columns.
// ---------------------------------------------------------------------------
/**
 * Best-known outstanding amount for an order's invoice.
 *
 * Priority:
 *   1. invoice_amount_remaining if populated (cached from NS sync)
 *   2. 0 if the invoice's status says "Paid In Full" — we know the
 *      balance regardless of whether sync has run, because the status
 *      column already implies it
 *   3. null otherwise — display as "—"
 *
 * Used by both the order detail Invoice card and the dashboard
 * Outstanding Balance badge so they agree.
 */
function derivedOutstanding(order: {
  netsuite_invoice_status?: string | null;
  invoice_amount_remaining?: number | null;
}): number | null {
  const cached = order.invoice_amount_remaining;
  if (cached != null && Number.isFinite(Number(cached))) {
    return Number(cached);
  }
  const status = (order.netsuite_invoice_status || '').toLowerCase();
  if (status.includes('paid in full')) return 0;
  return null;
}

function InvoiceCard({
  order,
}: {
  order: {
    invoice_number?: string | null;
    netsuite_invoice_id?: string | null;
    netsuite_invoice_status?: string | null;
    netsuite_invoice_date?: string | null;
    invoice_amount_remaining?: number | null;
    invoice_due_date?: string | null;
  };
}) {
  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Invoice</CardTitle>
        <InvoiceStatusBadge status={order.netsuite_invoice_status} />
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
        <Field label="Invoice #">
          {/* Plain text — clients don't have NetSuite access. Becomes a
              "Download PDF" link in Phase 3 (RESTlet). */}
          <span className="font-mono">{order.invoice_number}</span>
        </Field>
        <Field label="Issue date">
          <span>{formatNullableDate(order.netsuite_invoice_date)}</span>
        </Field>
        <Field label="Due date">
          <span>{formatNullableDate(order.invoice_due_date)}</span>
        </Field>
        <Field label="Outstanding">
          <OutstandingValue
            amount={derivedOutstanding(order)}
            dueDate={order.invoice_due_date}
          />
        </Field>
      </CardContent>
    </Card>
  );
}

function formatNullableDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // ISO YYYY-MM-DD → Mar 19, 2026
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const d = new Date(`${dueDate}T23:59:59Z`);
  return d.getTime() < Date.now();
}

function OutstandingValue({
  amount,
  dueDate,
}: {
  amount: number | null | undefined;
  dueDate: string | null | undefined;
}) {
  if (amount == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (amount <= 0.005) {
    return (
      <span className="font-mono text-emerald-700 font-medium">
        {formatCurrency(0)}
      </span>
    );
  }
  const overdue = isOverdue(dueDate);
  return (
    <span
      className={cn(
        'font-mono font-medium',
        overdue ? 'text-rose-700' : 'text-foreground',
      )}
    >
      {formatCurrency(amount)}
      {overdue && (
        <span className="ml-2 inline-flex items-center rounded-sm border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
          Overdue
        </span>
      )}
    </span>
  );
}

// Status colors mirror the NS invoice statuses we've observed in this
// account: "Paid In Full" (green), "Open" (amber), "Partially Paid"
// (amber too), anything else falls back to muted.
const INVOICE_STATUS_STYLES: Record<string, string> = {
  'Paid In Full': 'bg-[#D1FAE5] text-[#065F46] border-[#A7F3D0]',
  Open: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]',
  'Partially Paid': 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]',
};

function InvoiceStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  // NS sometimes prefixes statuses with "Invoice : " — strip it for display.
  const clean = status.replace(/^Invoice\s*:\s*/i, '');
  const style =
    INVOICE_STATUS_STYLES[clean] ||
    'bg-secondary text-muted-foreground border-border';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium',
        style,
      )}
    >
      {clean}
    </span>
  );
}
