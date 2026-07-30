'use client';

/**
 * Amazon overview dashboard — live SP-API data:
 * sales (today + period), fee breakdown by type, FBA inventory buckets,
 * refunds matched against the FBA returns report (did the unit come back,
 * and in what condition), and reimbursements with reasons.
 * Read-only; the NetSuite recording flow lives at /admin/netsuite/amazon-fba.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw, Undo2, PackageSearch } from 'lucide-react';

import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import {
  matchRefundsToReturns,
  feeLabel,
  type FinanceOverview,
  type ReturnRow,
  type ReimbursementReportRow,
  type RefundWithReturn,
} from '../../../lib/amazonSp/overview';
import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { Alert, AlertDescription } from '../../components/qq/alert';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../../components/qq/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/qq/select';

const money = (n: number | undefined | null) =>
  n === undefined || n === null
    ? '—'
    : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Metrics {
  totalSales?: { amount: number };
  orderCount?: number;
  unitCount?: number;
  averageUnitPrice?: { amount: number };
}

interface InventoryRow {
  sellerSku: string;
  productName?: string;
  totalQuantity: number;
  inventoryDetails?: {
    fulfillableQuantity?: number;
    inboundWorkingQuantity?: number;
    inboundShippedQuantity?: number;
    inboundReceivingQuantity?: number;
    reservedQuantity?: { totalReservedQuantity?: number };
    unfulfillableQuantity?: { totalUnfulfillableQuantity?: number };
  };
}

function amazonToday(): string {
  return new Date(Date.now() - 7 * 3600 * 1000).toISOString().split('T')[0];
}

function rangeFor(option: string): { from: string; to: string } {
  const today = amazonToday();
  const [y, m] = today.split('-').map(Number);
  if (option === 'last-month') {
    const first = new Date(Date.UTC(y, m - 2, 1));
    const last = new Date(Date.UTC(y, m - 1, 0));
    return { from: first.toISOString().split('T')[0], to: last.toISOString().split('T')[0] };
  }
  if (option === 'last-3-months') {
    const first = new Date(Date.UTC(y, m - 3, 1));
    return { from: first.toISOString().split('T')[0], to: today };
  }
  return { from: `${today.slice(0, 7)}-01`, to: today }; // this month
}

const RANGE_LABELS: Record<string, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'last-3-months': 'Last 3 months',
};

const RETURN_STATUS_UI: Record<RefundWithReturn['returnStatus'], { label: string; cls: string }> = {
  'returned-sellable': { label: 'Returned — sellable', cls: 'text-green-700 bg-green-50 border-green-200' },
  'returned-unsellable': { label: 'Returned — unsellable', cls: 'text-amber-700 bg-amber-50 border-amber-300' },
  partial: { label: 'Partially returned', cls: 'text-amber-700 bg-amber-50 border-amber-300' },
  'no-return': { label: 'No return recorded', cls: 'text-destructive bg-destructive/5 border-destructive/30' },
};

export default function AmazonOverviewPage() {
  const [range, setRange] = useState('this-month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [today, setToday] = useState<Metrics | null>(null);
  const [period, setPeriod] = useState<Metrics | null>(null);
  const [finance, setFinance] = useState<FinanceOverview | null>(null);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);

  const [returns, setReturns] = useState<ReturnRow[] | null>(null);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [reimbRows, setReimbRows] = useState<ReimbursementReportRow[] | null>(null);
  const [loadingReimb, setLoadingReimb] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  async function load() {
    setLoading(true);
    setError(null);
    setReturns(null);
    setReimbRows(null);
    try {
      const { from, to } = rangeFor(range);
      const res = await fetchWithAuth(`/api/amazon/dashboard?from=${from}&to=${to}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load Amazon data.');
      setToday(data.today);
      setPeriod(data.period);
      setFinance(data.finance);
      setInventory(data.inventory || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load Amazon data.');
    } finally {
      setLoading(false);
    }
  }

  /** Request an Amazon report and poll until it's ready (~30s–2min). */
  async function runReport(type: 'returns' | 'reimbursements', from: string, to: string) {
    const createRes = await fetchWithAuth('/api/amazon/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, from, to }),
    });
    const created = await createRes.json();
    if (!createRes.ok) throw new Error(created.error || 'Failed to request the report.');
    for (let attempt = 0; attempt < 36; attempt++) {
      await new Promise((r) => setTimeout(r, 5000));
      const pollRes = await fetchWithAuth(`/api/amazon/reports/${created.reportId}?type=${type}`);
      const poll = await pollRes.json();
      if (!pollRes.ok) throw new Error(poll.error || 'Report failed.');
      if (poll.status === 'DONE') return poll.rows || [];
    }
    throw new Error('Amazon is taking too long to generate the report — try again in a minute.');
  }

  async function loadReturns() {
    setLoadingReturns(true);
    setError(null);
    try {
      const { from, to } = rangeFor(range);
      // returns can trail the refund — look back an extra 30 days
      const fromWide = new Date(new Date(from).getTime() - 30 * 86400e3).toISOString().split('T')[0];
      setReturns(await runReport('returns', fromWide, to));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingReturns(false);
    }
  }

  async function loadReimbursements() {
    setLoadingReimb(true);
    setError(null);
    try {
      const { from, to } = rangeFor(range);
      setReimbRows(await runReport('reimbursements', from, to));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingReimb(false);
    }
  }

  const refundsWithReturns: RefundWithReturn[] | null =
    finance && returns ? matchRefundsToReturns(finance.refunds, returns) : null;

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title="Amazon"
        description="Live overview of your Amazon FBA activity, straight from the Selling Partner API."
        actions={
          <div className="flex items-center gap-2">
            <div className="w-40">
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RANGE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Link href="/admin/netsuite/amazon-fba">
              <Button size="sm">
                Record in NetSuite
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <Tile label="Today" value={loading ? '—' : money(today?.totalSales?.amount)} sub={loading ? undefined : `${today?.orderCount ?? 0} orders`} />
        <Tile label={`${RANGE_LABELS[range]} — ordered`} value={loading ? '—' : money(period?.totalSales?.amount)} sub={loading ? undefined : `${period?.orderCount ?? 0} orders · ${period?.unitCount ?? 0} units`} />
        <Tile label="Amazon fees (settled)" value={loading ? '—' : money(finance?.feeTotal)} sub={loading ? undefined : `${finance?.feeBuckets.length ?? 0} fee types`} />
        <Tile label="Refunds" value={loading ? '—' : money(finance?.refundTotal)} sub={loading ? undefined : `${finance?.refunds.length ?? 0} refund(s)`} />
        <Tile label="Reimbursements" value={loading ? '—' : money(finance?.reimbursementTotal)} sub={loading ? undefined : `${finance?.reimbursements.length ?? 0} event(s)`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Fees breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Fees — {RANGE_LABELS[range].toLowerCase()} (settlement dates)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-4">Loading…</p>
            ) : !finance || finance.feeBuckets.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No fees in this period.</p>
            ) : (
              <div className="space-y-1.5">
                {finance.feeBuckets.map((bucket) => (
                  <div key={bucket.feeType} className="flex items-center justify-between text-sm">
                    <span>
                      {feeLabel(bucket.feeType)}
                      <span className="text-xs text-muted-foreground ml-1.5">×{bucket.count}</span>
                    </span>
                    <span className="font-mono">{money(bucket.amount)}</span>
                  </div>
                ))}
                {finance.promotions !== 0 && (
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Seller-funded promotions (not a fee)</span>
                    <span className="font-mono">{money(finance.promotions)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm font-semibold border-t border-border pt-2 mt-2">
                  <span>Total fees</span>
                  <span className="font-mono">{money(finance.feeTotal)}</span>
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Settled sales in period: {money(finance.grossSales)} · {finance.unitsShipped} units shipped.
                  Ordered vs settled differ when orders ship near the period edge.
                </p>
                {finance.otherEvents.length > 0 && (
                  <p className="text-xs text-amber-700">
                    Also present (not itemized): {finance.otherEvents.map((o) => `${o.list} ×${o.count}`).join(', ')}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inventory */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">FBA inventory (live)</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {loading ? (
              <p className="text-sm text-muted-foreground py-4 px-6">Loading…</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Sellable</TableHead>
                    <TableHead className="text-right">Inbound</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Unsellable</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.map((row) => {
                    const d = row.inventoryDetails || {};
                    const inbound =
                      (d.inboundWorkingQuantity || 0) + (d.inboundShippedQuantity || 0) + (d.inboundReceivingQuantity || 0);
                    const unsellable = d.unfulfillableQuantity?.totalUnfulfillableQuantity || 0;
                    return (
                      <TableRow key={row.sellerSku}>
                        <TableCell className="font-mono text-xs">{row.sellerSku}</TableCell>
                        <TableCell className="text-right text-sm">{d.fulfillableQuantity ?? 0}</TableCell>
                        <TableCell className="text-right text-sm">{inbound}</TableCell>
                        <TableCell className="text-right text-sm">{d.reservedQuantity?.totalReservedQuantity ?? 0}</TableCell>
                        <TableCell className={`text-right text-sm ${unsellable > 0 ? 'text-destructive font-medium' : ''}`}>
                          {unsellable}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">{row.totalQuantity}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Refunds & returns */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Refunds — did the product come back?</CardTitle>
          <Button variant="outline" size="sm" onClick={loadReturns} loading={loadingReturns} disabled={loading || !finance || finance.refunds.length === 0}>
            <Undo2 className="h-4 w-4" />
            {returns ? 'Reload returns data' : 'Check returns (30–90s)'}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-2">Loading…</p>
          ) : !finance || finance.refunds.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No refunds in this period. 🎉</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Refunded</TableHead>
                  <TableHead>Return</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(refundsWithReturns || finance.refunds.map((r) => ({ ...r, returns: [], returnStatus: null as any }))).map((refund, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{refund.orderId}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {refund.postedDate ? new Date(refund.postedDate).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{refund.skus.join(', ')}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{money(refund.productRefund)}</TableCell>
                    <TableCell>
                      {refund.returnStatus ? (
                        <span className={`inline-flex text-xs font-medium border rounded-full px-2 py-0.5 ${RETURN_STATUS_UI[refund.returnStatus as RefundWithReturn['returnStatus']].cls}`}>
                          {RETURN_STATUS_UI[refund.returnStatus as RefundWithReturn['returnStatus']].label}
                          {refund.returns[0]?.reason ? ` · ${refund.returns[0].reason}` : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Run “Check returns”</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reimbursements */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm">Reimbursements — why Amazon paid you</CardTitle>
          <Button variant="outline" size="sm" onClick={loadReimbursements} loading={loadingReimb} disabled={loading}>
            <PackageSearch className="h-4 w-4" />
            {reimbRows ? 'Reload details' : 'Load detailed reasons (30–90s)'}
          </Button>
        </CardHeader>
        <CardContent>
          {reimbRows ? (
            reimbRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No reimbursements in this period.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Units (cash)</TableHead>
                    <TableHead className="text-right">Units (stock)</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reimbRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm text-muted-foreground">{row.approvalDate?.split('T')[0] || '—'}</TableCell>
                      <TableCell className="text-sm">{row.reason.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                      <TableCell className="text-right text-sm">{row.quantityCash}</TableCell>
                      <TableCell className="text-right text-sm">{row.quantityInventory}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{money(row.amountTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : finance && finance.reimbursements.length > 0 ? (
            <div className="space-y-1">
              {finance.reimbursements.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span>
                    {r.type.replace(/_/g, ' ')}
                    {r.sku && <span className="font-mono text-xs ml-2">{r.sku}</span>}
                    {r.quantity > 0 && <span className="text-xs text-muted-foreground ml-1">×{r.quantity}</span>}
                  </span>
                  <span className="font-mono">{money(r.amount)}</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-2">
                “Load detailed reasons” pulls Amazon’s reimbursement report: lost vs damaged in the
                warehouse, destroyed units, and whether you were paid in cash or replacement stock.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              No reimbursements in this period{loading ? '…' : ''} — “Load detailed reasons” checks Amazon’s full report either way.
            </p>
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
