'use client';

/**
 * Sales (NetSuite) for one company — the sales ledger next to the Hub.
 *
 * What NetSuite actually billed this customer (invoices, credit memos, cash
 * sales; mirrored nightly, read-only) and how it lines up with Hub orders:
 * which orders are fully billed, partly billed (backorders / price
 * differences) or not billed yet, and which sales happened outside the Hub.
 * Documents dated before the client's agreement never count toward targets.
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

import { fetchWithAuth } from '../../../../../lib/fetchWithAuth';
import { formatCurrency, formatDate, formatDateTime } from '../../../../../lib/formatters';
import { PageHeader } from '../../../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/qq/card';
import { Badge } from '../../../../components/qq/badge';
import { Button } from '../../../../components/qq/button';
import { Alert, AlertDescription } from '../../../../components/qq/alert';
import { EmptyState } from '../../../../components/qq/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/qq/table';
import { useToast } from '../../../../components/ui/ToastProvider';

type OrderState = 'billed' | 'partly_billed' | 'billed_more' | 'not_billed' | 'cancelled_but_billed';

interface LedgerLine {
  line_no: number;
  kind: 'product' | 'discount' | 'excluded';
  sku: string | null;
  item_name: string | null;
  quantity: number;
  amount: number;
}

interface LedgerDoc {
  id: string;
  doc_type: string;
  tranid: string;
  doc_date: string;
  currency: string;
  totalForeign: number;
  totalAmount: number;
  sales_amount: number;
  support_fund: number;
  excluded_amount: number;
  order_id: string | null;
  po_ref: string | null;
  memo: string | null;
  so_tranid: string | null;
  origin: 'hub' | 'outside_hub';
  beforeAgreement: boolean;
  suggestedOrder: { id: string; poNumber: string } | null;
  lines: LedgerLine[];
}

interface Payload {
  company: { id: string; name: string; netsuiteNumber: string | null; linked: boolean; contractDate: string | null };
  historyStartDate: string | null;
  sync: { last_synced_at: string | null; last_error: string | null; document_count: number } | null;
  totals: {
    sales: number;
    salesSinceAgreement: number;
    salesBeforeAgreement: number;
    outsideHub: number;
    supportFund: number;
    unbilledHubOrders: number;
  };
  orders: Array<{
    orderId: string;
    poNumber: string | null;
    status: string;
    hubTotal: number;
    billed: number;
    difference: number;
    documents: string[];
    state: OrderState;
  }>;
  documents: LedgerDoc[];
}

const STATE: Record<OrderState, { label: string; variant: 'success' | 'warning' | 'muted' | 'destructive' }> = {
  billed: { label: 'Billed', variant: 'success' },
  partly_billed: { label: 'Partly billed', variant: 'warning' },
  billed_more: { label: 'Billed more', variant: 'warning' },
  not_billed: { label: 'Not billed yet', variant: 'muted' },
  cancelled_but_billed: { label: 'Cancelled but billed', variant: 'destructive' },
};

const DOC_TYPE: Record<string, string> = {
  invoice: 'Invoice',
  credit_memo: 'Credit memo',
  cash_sale: 'Cash sale',
  cash_refund: 'Cash refund',
};

const money = (n: number) => formatCurrency(n);

export default function CompanySalesLedgerPage() {
  const params = useParams<{ id: string }>();
  const companyId = params?.id as string;
  const toast = useToast();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/sales-ledger/company/${companyId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load.');
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const syncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/sales-ledger/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Sync failed.');
      if (json.summary?.errors?.length) throw new Error(json.summary.errors[0].error);
      toast.success(`Synced ${json.summary.documents} documents from NetSuite.`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const t = data?.totals;
  const contract = data?.company.contractDate ?? null;

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link
          href={`/admin/companies/${companyId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to company
        </Link>
      </div>

      <PageHeader
        title="Sales (NetSuite)"
        description={
          data
            ? `${data.company.name}${data.company.netsuiteNumber ? ` · NetSuite #${data.company.netsuiteNumber}` : ''}`
            : undefined
        }
        actions={
          <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing || !data?.company.linked}>
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {data && !data.company.linked && (
        <Alert>
          <AlertDescription>
            This company has no NetSuite customer ID, so its NetSuite sales can&apos;t be read. Add it on the
            company&apos;s edit page.
          </AlertDescription>
        </Alert>
      )}
      {data && data.company.linked && !data.historyStartDate && (
        <Alert>
          <AlertDescription>
            The sales sync is off until a history start date is set in{' '}
            <Link href="/admin/settings?tab=sales" className="underline">
              Settings → Sales
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground">
        Everything NetSuite billed this customer since {data?.historyStartDate ? formatDate(data.historyStartDate) : '—'}
        , whether or not it started as a Hub order. Amounts are products only, in USD.
        {contract ? ` Agreement since ${formatDate(contract)} — earlier sales never count toward targets.` : ' No agreement date — nothing counts toward targets.'}
        {data?.sync?.last_synced_at ? ` Last synced ${formatDateTime(data.sync.last_synced_at)}.` : ' Not synced yet.'}
        {data?.sync?.last_error ? ` Last sync failed: ${data.sync.last_error}` : ''}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <Tile label="Sales since agreement" value={t ? money(t.salesSinceAgreement) : '—'} />
        <Tile label="Before agreement" value={t ? money(t.salesBeforeAgreement) : '—'} sub="not in targets" />
        <Tile label="Sold outside the Hub" value={t ? money(t.outsideHub) : '—'} />
        <Tile label="Support funds redeemed" value={t ? money(t.supportFund) : '—'} />
        <Tile label="Hub orders not yet billed" value={t ? money(t.unbilledHubOrders) : '—'} />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Hub orders vs NetSuite billing</CardTitle>
          <p className="text-sm text-muted-foreground">
            Partly billed = NetSuite has invoiced less than the Hub order (a backorder still open, or a price
            difference).
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {data && data.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground px-6 pb-4">No Hub orders.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead className="hidden md:table-cell">Hub status</TableHead>
                  <TableHead className="text-right">Hub total</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Difference</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead className="hidden lg:table-cell">NetSuite documents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.orders ?? []).map((o) => (
                  <TableRow key={o.orderId}>
                    <TableCell className="text-sm font-medium">
                      <Link href={`/admin/orders/${o.orderId}`} className="hover:underline">
                        {o.poNumber || '—'}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{o.status}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{money(o.hubTotal)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{o.documents.length ? money(o.billed) : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">
                      {o.documents.length && Math.abs(o.difference) > 0.01 ? money(o.difference) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATE[o.state].variant}>{STATE[o.state].label}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground font-mono">
                      {o.documents.join(', ') || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">NetSuite documents</CardTitle>
          <p className="text-sm text-muted-foreground">Click a document to see its lines and what counted.</p>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {loading && !data ? (
            <p className="text-sm text-muted-foreground px-6 pb-4">Loading…</p>
          ) : data && data.documents.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyState title="No documents yet" description="Run a sync to mirror this customer's NetSuite billing." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Date</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Support funds</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">Not counted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.documents ?? []).map((d) => {
                  const isOpen = open.has(d.id);
                  return (
                    <React.Fragment key={d.id}>
                      <TableRow className="cursor-pointer" onClick={() => toggle(d.id)}>
                        <TableCell className="text-muted-foreground">
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{formatDate(d.doc_date)}</TableCell>
                        <TableCell className="text-sm">
                          <span className="font-mono">{d.tranid}</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {d.doc_type !== 'invoice' && <Badge variant="outline">{DOC_TYPE[d.doc_type] ?? d.doc_type}</Badge>}
                            {d.beforeAgreement && <Badge variant="muted">Before agreement</Badge>}
                            {d.currency !== 'USD' && (
                              <Badge variant="muted">
                                {d.currency} {formatCurrency(d.totalForeign, false)}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {d.order_id ? (
                            <Link
                              href={`/admin/orders/${d.order_id}`}
                              className="hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Hub order{d.so_tranid ? ` · ${d.so_tranid}` : ''}
                            </Link>
                          ) : (
                            <div>
                              <Badge variant="accent">Outside the Hub</Badge>
                              {d.suggestedOrder && (
                                <p className="text-xs text-amber-700 mt-1">
                                  PO matches Hub order{' '}
                                  <Link
                                    href={`/admin/orders/${d.suggestedOrder.id}`}
                                    className="underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {d.suggestedOrder.poNumber}
                                  </Link>
                                  , which isn&apos;t linked to NetSuite
                                </p>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{money(d.sales_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">
                          {d.support_fund ? money(d.support_fund) : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm hidden lg:table-cell text-muted-foreground">
                          {d.excluded_amount ? money(d.excluded_amount) : '—'}
                        </TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow>
                          <TableCell />
                          <TableCell colSpan={6} className="bg-muted/30">
                            {d.memo && <p className="text-xs text-muted-foreground mb-2">Memo: {d.memo}</p>}
                            {d.po_ref && <p className="text-xs text-muted-foreground mb-2">PO: {d.po_ref}</p>}
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left font-normal py-1">Line</th>
                                  <th className="text-left font-normal py-1">Counts as</th>
                                  <th className="text-right font-normal py-1">Qty</th>
                                  <th className="text-right font-normal py-1">Amount (USD)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {d.lines.map((l) => (
                                  <tr key={l.line_no} className="border-t border-border/50">
                                    <td className="py-1">
                                      <span className="font-mono">{l.sku || '—'}</span>
                                      {l.item_name && l.item_name !== l.sku && (
                                        <span className="text-muted-foreground"> · {l.item_name}</span>
                                      )}
                                    </td>
                                    <td className="py-1">
                                      {l.kind === 'product' ? 'Sale' : l.kind === 'discount' ? 'Discount / support fund' : 'Not counted'}
                                    </td>
                                    <td className="py-1 text-right tabular-nums">{l.kind === 'product' ? l.quantity : ''}</td>
                                    <td className="py-1 text-right tabular-nums">{money(l.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground truncate">{sub}</p>}
    </Card>
  );
}
