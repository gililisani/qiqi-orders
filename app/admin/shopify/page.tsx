'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import { Skeleton } from '../../components/qq/skeleton';
import { Button } from '../../components/qq/button';
import { ReportsCard } from './reports-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/qq/table';
import { cn } from '../../../lib/utils';

interface OrderRow {
  shopify_order_id: string;
  order_name: string;
  order_created_at: string;
  buyer_kind: 'b2b' | 'b2c' | null;
  state: string;
  skip_reason: string | null;
  total_cents: number | null;
  ns_target: string | null;
  error_code: string | null;
  error_message: string | null;
  error_detail: {
    issues?: Array<{
      code: string;
      detail?: {
        candidates?: Array<{
          id: string;
          entityId: string;
          via: string;
          subsidiary?: string | null;
          createdAt?: string | null;
          transactionCount?: number | null;
          lastTransactionDate?: string | null;
        }>;
        disqualified?: Array<{ entityId: string; subsidiary?: string | null; reason: string }>;
        skus?: string[];
        sku?: string;
      };
    }>;
  } | null;
  links: {
    customer: string | null;
    so: string | null;
    invoice: string | null;
    fulfillments: (string | null)[];
    creditMemos: (string | null)[];
  };
}

interface PayoutRow {
  shopify_payout_id: string;
  issued_at: string;
  net_cents: number;
  fee_cents: number;
  state: string;
  error_message: string | null;
  links: { bill: string | null; journal: string | null };
}

interface PeriodSums {
  orders: number;
  valueCents: number;
  refundedCents: number;
  feesCents: number;
  gatewaysCents: Record<string, number>;
}

interface Overview {
  shopifyAdminBase: string | null;
  config: { mode: string; last_poll_at: string | null; last_poll_error: string | null };
  counts: Record<string, number>;
  errorCount: number;
  /** Store-wide snapshot from the poll cron (null until the first poll after deploy). */
  financials: {
    computedAt: string;
    periods: { today: PeriodSums; last7: PeriodSums; mtd: PeriodSums };
    nextPayout: { issuedAt: string | null; netAmount: number; status: string } | null;
  } | null;
  orders: OrderRow[];
  ordersTotal: number;
  /** All error-state orders, regardless of age — never window-dependent. */
  errors: OrderRow[];
  payouts: PayoutRow[];
}

type PeriodKey = 'today' | 'last7' | 'mtd';
const PERIOD_LABELS: Record<PeriodKey, string> = { today: 'Today', last7: '7 days', mtd: 'This month' };
const GATEWAY_LABELS: Record<string, string> = {
  shopify_payments: 'Shopify Payments',
  shop_cash: 'Shop Cash',
  shop_pay: 'Shop Pay',
  paypal: 'PayPal',
  affirm: 'Affirm',
};

const STATE_STYLES: Record<string, string> = {
  paid: 'bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE]',
  fulfilled: 'bg-[#D1FAE5] text-[#065F46] border-[#A7F3D0]',
  refunded: 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]',
  closed: 'bg-[#D1FAE5] text-[#065F46] border-[#A7F3D0]',
  skipped: 'bg-secondary text-muted-foreground border-border',
  pending: 'bg-secondary text-muted-foreground border-border',
  error: 'bg-brand-magenta/15 text-brand-magenta border-brand-magenta/40',
};

/** Plain-language guidance per error code (owner requirement #3). */
const ERROR_GUIDANCE: Record<string, string> = {
  UNKNOWN_SKU:
    'This SKU does not exist in NetSuite. Create the item in NS (or fix the SKU on the Shopify product), then Retry.',
  MISSING_SKU: 'A line on this order has no SKU (custom item). Fix the product in Shopify, then Retry.',
  AMBIGUOUS_CUSTOMER:
    'Same buyer, several NetSuite records. Pick the right one below (usually the one with the history) — the choice is permanent. Inactivating the empty duplicate in NS afterwards is tidy but optional.',
  NOT_USD: 'Non-USD money detected — this should never happen. Do not retry; investigate the order in Shopify.',
  TOTALS_MISMATCH: 'The order math does not reconcile to the cent. Do not retry; investigate.',
  PAYMENT_MISMATCH: 'Payments do not cover the charged total. Often resolves after Shopify settles — Retry later.',
  UNSUPPORTED_SOURCE: 'See the message — usually missing NS configuration (item, account, stock). Fix, then Retry.',
  GIFT_CARD_LINE: 'Order contains a gift card — not supported.',
  TAXES_INCLUDED: 'Tax-inclusive pricing detected — the store should be tax-exclusive. Investigate.',
  MISSING_ORDER: 'Nightly check found this order in Shopify but not in NetSuite. Retry books it (safe).',
  RECON_MISMATCH:
    'Nightly check found the NetSuite records disagree with Shopify (see message). Retry re-ensures the chain; if it persists, investigate the NS records.',
};

function StateBadge({ state }: { state: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium',
        STATE_STYLES[state] ?? STATE_STYLES.pending,
      )}
    >
      {state}
    </span>
  );
}

function NsLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-brand-periwinkle hover:underline"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

const money = (cents: number | null | undefined) =>
  cents == null ? '—' : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

/** Order number as a link into the Shopify admin (new tab). */
function OrderLink({ base, id, name, className }: { base: string | null; id: string; name: string; className?: string }) {
  if (!base) return <span className={className}>{name}</span>;
  return (
    <a
      href={`${base}/orders/${id}`}
      target="_blank"
      rel="noreferrer"
      className={cn('text-brand-periwinkle hover:underline', className)}
    >
      {name}
    </a>
  );
}

export default function ShopifySyncDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [importName, setImportName] = useState('');
  const [skuMapInput, setSkuMapInput] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState<PeriodKey>('mtd');
  const todayIso = new Date().toISOString().slice(0, 10);
  const [stmtFrom, setStmtFrom] = useState(todayIso.slice(0, 8) + '01');
  const [stmtTo, setStmtTo] = useState(todayIso);
  const [stmtBusy, setStmtBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedRef = useRef<number>(20);

  const load = useCallback(async (limit?: number) => {
    try {
      // Refreshes keep however many rows the user has expanded to.
      const keep = limit ?? loadedRef.current ?? 20;
      const res = await fetchWithAuth(`/api/shopify/sync/overview?ordersLimit=${keep}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      loadedRef.current = json.orders?.length ?? 20;
      setData(json);
      setLoadError(null);
    } catch (err: any) {
      setLoadError(String(err?.message ?? err));
    }
  }, []);

  const loadMore = async () => {
    if (!data) return;
    setLoadingMore(true);
    try {
      const res = await fetchWithAuth(
        `/api/shopify/sync/overview?ordersOffset=${data.orders.length}&ordersLimit=50`,
      );
      const json = await res.json();
      if (res.ok && json.orders) {
        const seen = new Set(data.orders.map((o) => o.shopify_order_id));
        const merged = [...data.orders, ...json.orders.filter((o: OrderRow) => !seen.has(o.shopify_order_id))];
        loadedRef.current = merged.length;
        setData({ ...data, orders: merged, ordersTotal: json.ordersTotal ?? data.ordersTotal });
      }
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (path: string, body: Record<string, unknown>, busyKey: string) => {
    setRetrying(busyKey);
    setActionMsg(null);
    try {
      const res = await fetchWithAuth(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) setActionMsg(json.error || `HTTP ${res.status}`);
      else if (json.result === 'ok') setActionMsg(`${json.orderName ?? ''} synced (${json.state})`.trim());
      else if (json.result === 'still_error') setActionMsg(`${json.orderName ?? 'Order'} still parked: ${json.issues?.[0]?.message ?? ''}`.slice(0, 200));
      else if (json.result === 'ignored') setActionMsg('Order marked as ignored');
      else if (json.result === 'skipped') setActionMsg(`Skipped: ${json.message}`);
      else if (json.mapped) setActionMsg(`SKU mapped to ${json.mapped}`);
      await load();
    } finally {
      setRetrying(null);
    }
  };

  const retry = (shopifyOrderId: string) => act('/api/shopify/sync/retry', { shopifyOrderId }, shopifyOrderId);
  const ignore = (shopifyOrderId: string) => {
    const note = window.prompt('Why is this order being ignored? (required, audited)');
    if (note?.trim()) act('/api/shopify/sync/ignore', { shopifyOrderId, note }, shopifyOrderId);
  };
  const resolveCustomer = (shopifyOrderId: string, nsCustomerId: string) =>
    act('/api/shopify/sync/resolve-customer', { shopifyOrderId, nsCustomerId }, shopifyOrderId);
  const mapSku = (shopifyOrderId: string, shopifySku: string) => {
    const nsItem = skuMapInput[`${shopifyOrderId}:${shopifySku}`]?.trim();
    if (nsItem) act('/api/shopify/sync/map-sku', { shopifySku, nsItem, retryShopifyOrderId: shopifyOrderId }, shopifyOrderId);
  };
  const importOrder = () => {
    if (importName.trim()) act('/api/shopify/sync/import-order', { orderName: importName.trim() }, 'import');
  };
  // Part 1 reconciliation: Shopify transactions as a 100501 "bank statement"
  // (OFX) for NetSuite Banking Import → Match Bank Data pairs them with the
  // engine's payments/refunds/payout journals.
  const downloadStatement = async () => {
    setStmtBusy(true);
    setActionMsg(null);
    try {
      const res = await fetchWithAuth(`/api/shopify/statement?from=${stmtFrom}&to=${stmtTo}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shopify-100501-${stmtFrom}_${stmtTo}.ofx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setActionMsg(`100501 statement ${stmtFrom} → ${stmtTo}: ${res.headers.get('X-Statement-Lines') ?? '?'} lines — import it in NetSuite (Transactions → Bank → Banking Import), then Match Bank Data on 100501.`);
    } catch (e: any) {
      setActionMsg(`Statement failed: ${String(e?.message ?? e)}`);
    } finally {
      setStmtBusy(false);
    }
  };

  const errors = data?.errors ?? [];
  const nonErrors = data?.orders.filter((o) => o.state !== 'error') ?? [];
  const sums = data?.financials?.periods?.[period] ?? null;

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Shopify Sync"
        description="Shopify → NetSuite: orders, fulfillments, refunds, payouts"
        actions={
          <div className="flex items-center gap-2">
            <input
              value={importName}
              onChange={(e) => setImportName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && importOrder()}
              placeholder="Import order # (e.g. 7268)"
              className="h-9 w-52 rounded-md border border-border bg-background px-3 text-sm"
            />
            <Button size="sm" variant="outline" disabled={retrying === 'import'} onClick={importOrder}>
              Import
            </Button>
            <span className="mx-1 h-6 w-px bg-border" aria-hidden />
            <input
              type="date"
              value={stmtFrom}
              max={stmtTo}
              onChange={(e) => setStmtFrom(e.target.value)}
              aria-label="Statement from"
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            />
            <input
              type="date"
              value={stmtTo}
              min={stmtFrom}
              onChange={(e) => setStmtTo(e.target.value)}
              aria-label="Statement to"
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            />
            <Button size="sm" variant="outline" disabled={stmtBusy || !stmtFrom || !stmtTo} onClick={downloadStatement}>
              {stmtBusy ? 'Building…' : '100501 statement (OFX)'}
            </Button>
          </div>
        }
      />
      {actionMsg && (
        <div className="mb-4 rounded-md border border-border bg-secondary px-3 py-2 text-sm">{actionMsg}</div>
      )}

      {loadError && (
        <Card className="mb-6 border-brand-magenta/40">
          <CardContent className="p-4 text-sm text-brand-magenta">
            Couldn&apos;t load sync state: {loadError}
          </CardContent>
        </Card>
      )}

      {!data && !loadError && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {data && (
        <>
          {/* Financial strip — the store's numbers, straight from Shopify */}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">
              Store financials (ET)
              {data.financials && (
                <span className="ml-2 font-normal">
                  · as of{' '}
                  {new Date(data.financials.computedAt).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/New_York',
                  })}{' '}
                  ET
                </span>
              )}
            </p>
            <div className="inline-flex rounded-md border border-border p-0.5">
              {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setPeriod(k)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                    period === k ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {PERIOD_LABELS[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Total orders</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {sums ? `${sums.orders} · ${money(sums.valueCents)}` : '—'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {sums && sums.refundedCents > 0
                    ? `net ${money(sums.valueCents - sums.refundedCents)} after ${money(sums.refundedCents)} refunds`
                    : PERIOD_LABELS[period]}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Processing fees</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{sums ? money(sums.feesCents) : '—'}</p>
                <p className="mt-1 text-xs text-muted-foreground">Shopify Payments charges → 622070</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Payments by method</p>
                {sums && Object.keys(sums.gatewaysCents).length > 0 ? (
                  <div className="mt-1 space-y-0.5">
                    {Object.entries(sums.gatewaysCents)
                      .sort(([, a], [, b]) => b - a)
                      .map(([gw, cents]) => (
                        <p key={gw} className="flex justify-between text-sm tabular-nums">
                          <span className="text-muted-foreground">{GATEWAY_LABELS[gw] ?? gw}</span>
                          <span className="font-medium">{money(cents)}</span>
                        </p>
                      ))}
                  </div>
                ) : (
                  <p className="mt-1 text-2xl font-semibold">—</p>
                )}
              </CardContent>
            </Card>
            <Card className={cn(data.errorCount > 0 && 'border-brand-magenta/40')}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Error orders</p>
                <p className={cn('mt-1 text-2xl font-semibold tabular-nums', data.errorCount > 0 && 'text-brand-magenta')}>
                  {data.errorCount}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.errorCount > 0 ? 'needs attention below' : 'all clear'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Next payout</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {data.financials?.nextPayout ? `$${data.financials.nextPayout.netAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.financials?.nextPayout
                    ? data.financials.nextPayout.issuedAt
                      ? `${new Date(data.financials.nextPayout.issuedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${data.financials.nextPayout.status.toLowerCase().replace('_', ' ')}`
                      : 'balance accumulating · pays out Monday'
                    : 'none scheduled'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Sync plumbing — secondary */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            <span>
              Mode: <span className="font-medium capitalize text-foreground">{data.config.mode}</span>
              {data.config.mode === 'live' && ' (NS Production)'}
            </span>
            <span>
              Last poll:{' '}
              <span className="font-medium text-foreground">
                {data.config.last_poll_at
                  ? new Date(data.config.last_poll_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'
                  : 'never'}
              </span>
            </span>
            <span>
              Synced: <span className="font-medium text-foreground">{(data.counts['paid'] ?? 0) + (data.counts['fulfilled'] ?? 0) + (data.counts['refunded'] ?? 0)}</span>{' '}
              ({data.counts['fulfilled'] ?? 0} fulfilled · {data.counts['refunded'] ?? 0} refunded)
            </span>
            {data.config.last_poll_error && (
              <span className="text-brand-magenta">poll error: {data.config.last_poll_error.slice(0, 60)}</span>
            )}
          </div>

          {/* Error queue */}
          {errors.length > 0 && (
            <Card className="mt-6 border-brand-magenta/40">
              <CardHeader>
                <CardTitle>Needs attention</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {errors.map((o) => (
                  <div key={o.shopify_order_id} className="rounded-md border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <OrderLink base={data.shopifyAdminBase} id={o.shopify_order_id} name={o.order_name} className="font-medium" />
                        <span className="ml-2 text-sm text-muted-foreground">
                          {new Date(o.order_created_at).toLocaleDateString()} · {money(o.total_cents)}
                        </span>
                        <span className="ml-2 inline-flex items-center rounded-sm border border-brand-magenta/40 bg-brand-magenta/10 px-1.5 py-0.5 text-xs text-brand-magenta">
                          {o.error_code}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retrying === o.shopify_order_id}
                          onClick={() => retry(o.shopify_order_id)}
                        >
                          <RefreshCw className={cn('mr-1 h-3.5 w-3.5', retrying === o.shopify_order_id && 'animate-spin')} />
                          Retry
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={retrying === o.shopify_order_id}
                          onClick={() => ignore(o.shopify_order_id)}
                        >
                          Ignore…
                        </Button>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-foreground">{o.error_message}</p>
                    {o.error_code && ERROR_GUIDANCE[o.error_code] && (
                      <p className="mt-1 text-sm text-muted-foreground">{ERROR_GUIDANCE[o.error_code]}</p>
                    )}
                    {/* Ambiguous customer: pick the right NS record. */}
                    {o.error_code === 'AMBIGUOUS_CUSTOMER' &&
                      (o.error_detail?.issues?.[0]?.detail?.candidates ?? []).length > 0 && (
                        <div className="mt-2 space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Same person, two NetSuite records — pick the one with the history (the stamp is permanent):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {o.error_detail!.issues![0].detail!.candidates!.map((c) => (
                              <Button
                                key={c.id}
                                size="sm"
                                variant="outline"
                                disabled={retrying === o.shopify_order_id}
                                onClick={() => resolveCustomer(o.shopify_order_id, c.id)}
                                className="h-auto flex-col items-start py-1.5 text-left"
                              >
                                <span className="font-medium">Use {c.entityId}</span>
                                <span className="text-xs font-normal text-muted-foreground">
                                  {c.transactionCount ?? '?'} transactions
                                  {c.lastTransactionDate ? ` · last ${c.lastTransactionDate}` : ''}
                                  {c.createdAt ? ` · created ${c.createdAt}` : ''}
                                  {c.subsidiary ? ` · ${c.subsidiary}` : ''}
                                </span>
                              </Button>
                            ))}
                          </div>
                          {(o.error_detail!.issues![0].detail!.disqualified ?? []).length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Not offered (wrong subsidiary):{' '}
                              {o.error_detail!.issues![0].detail!.disqualified!.map((d) => `${d.entityId} (${d.subsidiary ?? '?'})`).join(', ')}
                            </p>
                          )}
                        </div>
                      )}
                    {/* Unknown SKU: map it once, forever. */}
                    {o.error_code === 'UNKNOWN_SKU' &&
                      (o.error_detail?.issues?.[0]?.detail?.skus ??
                        (o.error_detail?.issues?.[0]?.detail?.sku ? [o.error_detail.issues[0].detail.sku] : [])
                      ).map((sku) => (
                        <div key={sku} className="mt-2 flex items-center gap-2">
                          <span className="text-sm font-mono">{sku}</span>
                          <span className="text-sm text-muted-foreground">→ NS item code or id:</span>
                          <input
                            value={skuMapInput[`${o.shopify_order_id}:${sku}`] ?? ''}
                            onChange={(e) =>
                              setSkuMapInput((m) => ({ ...m, [`${o.shopify_order_id}:${sku}`]: e.target.value }))
                            }
                            className="h-8 w-40 rounded-md border border-border bg-background px-2 text-sm"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={retrying === o.shopify_order_id}
                            onClick={() => mapSku(o.shopify_order_id, sku)}
                          >
                            Map &amp; retry
                          </Button>
                        </div>
                      ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Orders table */}
          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent orders</CardTitle>
                <span className="text-xs text-muted-foreground">
                  showing {data.orders.length} of {data.ordersTotal}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Buyer</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>NetSuite chain</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {nonErrors.map((o) => (
                    <TableRow key={o.shopify_order_id}>
                      <TableCell className="font-medium">
                        <OrderLink base={data.shopifyAdminBase} id={o.shopify_order_id} name={o.order_name} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(o.order_created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="uppercase text-xs text-muted-foreground">{o.buyer_kind ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(o.total_cents)}</TableCell>
                      <TableCell>
                        <StateBadge state={o.state} />
                        {o.skip_reason && (
                          <span className="ml-1 text-xs text-muted-foreground">{o.skip_reason}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <NsLink href={o.links.customer} label="Customer" />
                          <NsLink href={o.links.so} label="SO" />
                          <NsLink href={o.links.invoice} label="Invoice" />
                          {o.links.fulfillments.map((href, i) => (
                            <NsLink key={`f${i}`} href={href} label={`IF${o.links.fulfillments.length > 1 ? ` ${i + 1}` : ''}`} />
                          ))}
                          {o.links.creditMemos.map((href, i) => (
                            <NsLink key={`c${i}`} href={href} label={`CM${o.links.creditMemos.length > 1 ? ` ${i + 1}` : ''}`} />
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data.orders.length < data.ordersTotal && (
                <div className="mt-4 flex justify-center">
                  <Button size="sm" variant="outline" disabled={loadingMore} onClick={loadMore}>
                    {loadingMore ? 'Loading…' : `Load ${Math.min(50, data.ordersTotal - data.orders.length)} more`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payouts */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Payouts</CardTitle>
            </CardHeader>
            <CardContent>
              {data.payouts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payouts booked yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payout</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Net to bank</TableHead>
                      <TableHead className="text-right">Fees</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>NetSuite</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.payouts.map((p) => (
                      <TableRow key={p.shopify_payout_id}>
                        <TableCell className="font-mono text-xs">{p.shopify_payout_id}</TableCell>
                        <TableCell>{new Date(p.issued_at).toLocaleDateString()}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', p.net_cents < 0 && 'text-brand-magenta')}>
                          {money(p.net_cents)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{money(p.fee_cents)}</TableCell>
                        <TableCell>
                          <StateBadge state={p.state === 'booked' ? 'fulfilled' : p.state} />
                          {p.error_message && (
                            <span className="ml-1 text-xs text-muted-foreground">{p.error_message.slice(0, 60)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 text-xs">
                            <NsLink href={p.links.bill} label="Fee bill" />
                            <NsLink href={p.links.journal} label="Journal" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
      <ReportsCard />
    </div>
  );
}