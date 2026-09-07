'use client';

/**
 * Payouts tab — full-2026 payout activity across all three money rails
 * (owner 2026-09-07): Shopify Payments payouts (with NS links where the
 * Hub booked them — pre-cutover rows have none, expected), PayPal
 * withdrawals, and Affirm deposits. Each card pages at 10 rows to keep
 * the tab compact.
 */

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/qq/table';
import { Badge } from '../../components/qq/badge';
import { Pagination } from '../../components/qq/pagination';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';

const PAGE = 10;
const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

function useFetch<T>(url: string, pick: (json: any) => T) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth(url);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        setData(pick(j));
      } catch (e: any) {
        setErr(String(e?.message ?? e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return { data, err };
}

function CardShell({
  title,
  err,
  loaded,
  empty,
  children,
  pager,
}: {
  title: string;
  err: string | null;
  loaded: boolean;
  empty: boolean;
  children: React.ReactNode;
  pager: React.ReactNode;
}) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {err ? (
          <p className="text-sm text-muted-foreground">Unavailable right now: {err}</p>
        ) : !loaded ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : empty ? (
          <p className="text-sm text-muted-foreground">Nothing in 2026 yet.</p>
        ) : (
          <>
            {children}
            {pager}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= PAGE) return null;
  return (
    <Pagination
      className="mt-3"
      page={page}
      totalPages={Math.ceil(total / PAGE)}
      totalItems={total}
      onPageChange={onChange}
    />
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
      {label} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

// ---------------------------------------------------------------------------

interface ShopifyPayoutRow {
  payout_id: string;
  issued_at: string;
  status: string;
  net_cents: number;
  fee_cents: number;
  state: string | null;
  error_message: string | null;
  links: { bill: string | null; journal: string | null };
}

function ShopifyPayoutsCard() {
  const { data, err } = useFetch<ShopifyPayoutRow[]>('/api/shopify/sync/shopify-payouts', (j) => j.payouts);
  const [page, setPage] = useState(1);
  const rows = data ?? [];
  const slice = rows.slice((page - 1) * PAGE, page * PAGE);
  return (
    <CardShell
      title="Shopify payouts (2026)"
      err={err}
      loaded={data !== null}
      empty={rows.length === 0}
      pager={<Pager page={page} total={rows.length} onChange={setPage} />}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Payout</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Net to bank</TableHead>
            <TableHead className="text-right">Fees</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>NetSuite</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.map((p) => (
            <TableRow key={p.payout_id}>
              <TableCell className="font-mono text-xs">{p.payout_id}</TableCell>
              <TableCell>{new Date(`${p.issued_at}T00:00:00Z`).toLocaleDateString()}</TableCell>
              <TableCell className="text-right tabular-nums">{money(p.net_cents)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(p.fee_cents)}</TableCell>
              <TableCell>
                <Badge variant={p.state === 'booked' ? 'success' : p.state ? 'warning' : 'muted'}>
                  {p.state === 'booked' ? 'booked' : p.state ?? p.status.toLowerCase()}
                </Badge>
                {p.error_message && (
                  <span className="ml-1 text-xs text-muted-foreground">{p.error_message.slice(0, 50)}</span>
                )}
              </TableCell>
              <TableCell>
                {p.links.bill || p.links.journal ? (
                  <div className="flex gap-2 text-xs">
                    <NsLink href={p.links.bill} label="Fee bill" />
                    <NsLink href={p.links.journal} label="Journal" />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">pre-Hub</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardShell>
  );
}

// ---------------------------------------------------------------------------

interface PaypalWithdrawalRow {
  transaction_id: string;
  date: string;
  amount_cents: number;
}

function PaypalWithdrawalsCard() {
  const { data, err } = useFetch<PaypalWithdrawalRow[]>('/api/shopify/sync/paypal-payouts', (j) => j.withdrawals);
  const [page, setPage] = useState(1);
  const rows = data ?? [];
  const slice = rows.slice((page - 1) * PAGE, page * PAGE);
  return (
    <CardShell
      title="PayPal withdrawals (2026)"
      err={err}
      loaded={data !== null}
      empty={rows.length === 0}
      pager={<Pager page={page} total={rows.length} onChange={setPage} />}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Withdrawal</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Amount to bank</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.map((w) => (
            <TableRow key={w.transaction_id}>
              <TableCell className="font-mono text-xs">{w.transaction_id}</TableCell>
              <TableCell>{new Date(`${w.date}T00:00:00Z`).toLocaleDateString()}</TableCell>
              <TableCell className="text-right tabular-nums font-medium">{money(w.amount_cents)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardShell>
  );
}

// ---------------------------------------------------------------------------

interface Remittance {
  deposit_id: string;
  issued_at: string;
  sales_cents: number;
  refunds_cents: number;
  fee_cents: number;
  net_cents: number;
  events: number;
}

function AffirmRemittancesCard() {
  const { data, err } = useFetch<Remittance[]>('/api/shopify/sync/affirm-remittances', (j) => j.remittances);
  const [page, setPage] = useState(1);
  const rows = data ?? [];
  const slice = rows.slice((page - 1) * PAGE, page * PAGE);
  return (
    <CardShell
      title="Affirm deposits (2026)"
      err={err}
      loaded={data !== null}
      empty={rows.length === 0}
      pager={<Pager page={page} total={rows.length} onChange={setPage} />}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Deposit</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Sales</TableHead>
            <TableHead className="text-right">Refunds</TableHead>
            <TableHead className="text-right">Fees</TableHead>
            <TableHead className="text-right">Net to bank</TableHead>
            <TableHead className="text-right">Loans</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.map((r) => (
            <TableRow key={r.deposit_id}>
              <TableCell className="font-mono text-xs">{r.deposit_id}</TableCell>
              <TableCell>{new Date(r.issued_at).toLocaleDateString()}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.sales_cents)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.refunds_cents)}</TableCell>
              <TableCell className="text-right tabular-nums">{money(r.fee_cents)}</TableCell>
              <TableCell className="text-right tabular-nums font-medium">{money(r.net_cents)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.events}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardShell>
  );
}

export function PayoutsTab() {
  return (
    <>
      <ShopifyPayoutsCard />
      <PaypalWithdrawalsCard />
      <AffirmRemittancesCard />
    </>
  );
}
