'use client';

/**
 * Billing center, Phase A — every invoice the Hub knows about, from the
 * NetSuite-synced fields cached on orders (invoice number/date/due/amount
 * remaining) plus Stripe links for card-payment companies. Phase B (the
 * actual invoice PDF from NetSuite) is the planned RESTlet work.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Receipt } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import { invoiceInfo, type InvoiceState } from '../../../lib/clientInvoices';

import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent } from '../../components/qq/card';
import { Badge } from '../../components/qq/badge';
import { Button } from '../../components/qq/button';
import { Alert, AlertDescription } from '../../components/qq/alert';
import { EmptyState } from '../../components/qq/empty-state';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../components/qq/table';

interface InvoiceOrder {
  id: string;
  po_number: string | null;
  total_value: number;
  invoice_number: string | null;
  netsuite_invoice_date: string | null;
  invoice_due_date: string | null;
  invoice_amount_remaining: number | null;
  netsuite_invoice_status: string | null;
  payment_status: string | null;
  paid_at: string | null;
  stripe_hosted_url: string | null;
}

const STATE_BADGE: Record<InvoiceState, { label: string; variant: 'success' | 'warning' | 'destructive' | 'muted' }> = {
  paid: { label: 'Paid', variant: 'success' },
  open: { label: 'Open', variant: 'warning' },
  overdue: { label: 'Overdue', variant: 'destructive' },
  unknown: { label: '—', variant: 'muted' },
};

export default function ClientBillingPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<InvoiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // RLS scopes to the caller's own company.
        const { data, error: err } = await supabase
          .from('orders')
          .select(
            'id, po_number, total_value, invoice_number, netsuite_invoice_date, invoice_due_date, invoice_amount_remaining, netsuite_invoice_status, payment_status, paid_at, stripe_hosted_url'
          )
          .not('invoice_number', 'is', null)
          .order('netsuite_invoice_date', { ascending: false, nullsFirst: false });
        if (err) throw err;
        setOrders((data as InvoiceOrder[]) || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load invoices.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const now = Date.now();
  const infos = orders.map((o) => ({ order: o, info: invoiceInfo(o, now) }));
  const outstanding = infos.filter(({ info }) => info.state === 'open' || info.state === 'overdue');
  const totalOutstanding = outstanding.reduce((s, { info }) => s + (info.remaining ?? 0), 0);
  const overdue = infos.filter(({ info }) => info.state === 'overdue');
  const totalOverdue = overdue.reduce((s, { info }) => s + (info.remaining ?? 0), 0);

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading billing…</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title="Billing"
        description="Your invoices, balances and payment status."
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Outstanding</p>
          <p className="mt-1 text-2xl font-semibold font-mono tabular-nums">
            {formatCurrency(totalOutstanding)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {outstanding.length} invoice{outstanding.length === 1 ? '' : 's'}
          </p>
        </Card>
        <Card className={`p-4 ${overdue.length > 0 ? 'border-rose-200 bg-rose-50/40' : ''}`}>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Overdue</p>
          <p
            className={`mt-1 text-2xl font-semibold font-mono tabular-nums ${
              overdue.length > 0 ? 'text-rose-700' : ''
            }`}
          >
            {formatCurrency(totalOverdue)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {overdue.length} invoice{overdue.length === 1 ? '' : 's'}
          </p>
        </Card>
        <Card className="p-4 hidden lg:block">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Invoices total</p>
          <p className="mt-1 text-2xl font-semibold font-mono tabular-nums">{orders.length}</p>
          <p className="text-xs text-muted-foreground mt-1">synced from our accounting system</p>
        </Card>
      </div>

      {/* Invoice table */}
      <Card>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Invoices appear here once your orders are invoiced."
              className="border-0 shadow-none"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="hidden md:table-cell">PO number</TableHead>
                  <TableHead className="hidden sm:table-cell">Invoice date</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Balance due</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {infos.map(({ order, info }) => (
                  <TableRow
                    key={order.id}
                    onClick={() => router.push(`/client/orders/${order.id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-mono text-sm">{order.invoice_number}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {order.po_number || '—'}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {order.netsuite_invoice_date ? formatDate(order.netsuite_invoice_date) : '—'}
                    </TableCell>
                    <TableCell
                      className={`text-sm ${info.overdue ? 'text-rose-700 font-medium' : 'text-muted-foreground'}`}
                    >
                      {order.invoice_due_date ? formatDate(order.invoice_due_date) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATE_BADGE[info.state].variant}>
                        {STATE_BADGE[info.state].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {info.remaining != null ? formatCurrency(info.remaining) : '—'}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {order.stripe_hosted_url &&
                        (info.state === 'open' || info.state === 'overdue' ? (
                          <a href={order.stripe_hosted_url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm">
                              <CreditCard className="h-4 w-4" /> Pay now
                            </Button>
                          </a>
                        ) : info.state === 'paid' && order.payment_status === 'paid' ? (
                          <a href={order.stripe_hosted_url} target="_blank" rel="noopener noreferrer">
                            <Button variant="outline" size="sm">
                              <Receipt className="h-4 w-4" /> Receipt
                            </Button>
                          </a>
                        ) : null)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Balances sync from our accounting system and may lag a recent payment by a
        day. Questions about an invoice? Reach us at accounting@qiqiglobal.com.
      </p>
    </div>
  );
}
