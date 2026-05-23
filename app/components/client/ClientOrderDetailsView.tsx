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

  const canEdit = order.status === 'Draft' || order.status === 'Open';
  const canDelete = order.status === 'Draft';
  const showPackingSlip = ['Ready', 'Done'].includes(order.status);

  // Totals breakdown
  const regularItems = items.filter((i) => !i.is_support_fund_item);
  const supportItems = items.filter((i) => i.is_support_fund_item);
  const regularSubtotal = regularItems.reduce((s, i) => s + (i.total_price || 0), 0);
  const supportSubtotal = supportItems.reduce((s, i) => s + (i.total_price || 0), 0);
  const balance = (order.support_fund_used || 0) - supportSubtotal;

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
                {formatCurrency(order.total_value || 0)}
              </span>
            </Field>
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
          <Separator />
          <Row
            label="Total order value"
            value={formatCurrency(order.total_value)}
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
