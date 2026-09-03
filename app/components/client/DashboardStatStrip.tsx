'use client';

/**
 * Dashboard stat strip (owner redesign 2026-09-02) — four quiet tiles:
 *   1. Open invoices ($ outstanding, link to Billing)
 *   2. Open orders (count, link to Orders)
 *   3. Purchases this period + a solid progress ring vs the period goal,
 *      with this-year purchases as the subtitle
 *   4. Support funds earned this year
 * Deliberately monochrome/elegant — no colored card backgrounds. Tiles 3–4
 * come from /api/client/performance and hide themselves when the caller
 * lacks the reports permission (the strip must not degrade the dashboard
 * for orders-only users).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, ShoppingCart, TrendingUp, Gift } from 'lucide-react';

import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { invoiceInfo, type InvoiceOrderFields } from '../../../lib/clientInvoices';
import type { CompanyPerformance } from '../../../lib/companyPerformance';
import { Card, CardContent } from '../qq/card';

const money = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export interface StatStripOrder extends InvoiceOrderFields {
  status: string;
}

/** Small solid-fill progress ring — one neutral color, no traffic lights. */
function GoalRing({ fraction }: { fraction: number }) {
  const f = Math.max(0, Math.min(1, fraction));
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0" aria-hidden>
      <circle cx="11" cy="11" r={r} fill="none" strokeWidth="4" className="stroke-border" />
      <circle
        cx="11"
        cy="11"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="butt"
        className="stroke-foreground"
        strokeDasharray={`${c * f} ${c}`}
        transform="rotate(-90 11 11)"
      />
    </svg>
  );
}

function Tile({
  href,
  icon,
  label,
  children,
  sub,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  sub?: React.ReactNode;
}) {
  const body = (
    <Card className={`h-full ${href ? 'hover:bg-secondary/40 transition-colors' : ''}`}>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          {icon} {label}
        </p>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground flex items-center gap-2">
          {children}
        </div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export function DashboardStatStrip({ orders }: { orders: StatStripOrder[] }) {
  const [perf, setPerf] = useState<CompanyPerformance | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth('/api/client/performance?window=this-year');
        if (!res.ok) return; // no reports permission / failure → tiles 3–4 stay hidden
        const payload = await res.json();
        if (!cancelled) setPerf(payload);
      } catch {
        /* stay hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tile 1 — open invoices.
  let openTotal = 0;
  let openCount = 0;
  let overdueCount = 0;
  for (const o of orders) {
    const info = invoiceInfo(o);
    if (info.remaining != null && info.remaining > 0.005) {
      openTotal += info.remaining;
      openCount += 1;
      if (info.overdue) overdueCount += 1;
    }
  }

  // Tile 2 — open orders.
  const openOrders = orders.filter((o) => o.status === 'Open').length;

  // Tiles 3–4 — performance-backed.
  const todayISO = new Date().toISOString().slice(0, 10);
  const active = perf?.periods.find((p) => p.startDate <= todayISO && todayISO <= p.endDate);
  const showPeriod = !!perf;
  const showSf = !!perf?.company.isEnrolled;

  const tiles: React.ReactNode[] = [
    <Tile
      key="invoices"
      href="/client/billing"
      icon={<FileText className="h-3.5 w-3.5" />}
      label="Open invoices"
      sub={
        openCount > 0
          ? `${openCount} invoice${openCount === 1 ? '' : 's'}${overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}`
          : 'nothing outstanding'
      }
    >
      {money(openTotal)}
    </Tile>,
    <Tile
      key="orders"
      href="/client/orders"
      icon={<ShoppingCart className="h-3.5 w-3.5" />}
      label="Open orders"
      sub={openOrders > 0 ? 'awaiting acceptance by Qiqi' : 'no orders waiting'}
    >
      {openOrders}
    </Tile>,
  ];

  if (showPeriod && perf) {
    tiles.push(
      <Tile
        key="period"
        href="/client/performance"
        icon={<TrendingUp className="h-3.5 w-3.5" />}
        label={active ? 'Purchases this period' : 'Purchases this year'}
        sub={active ? `${money(perf.window.sales)} this year` : undefined}
      >
        {money(active ? active.actual : perf.window.sales)}
        {active && active.target > 0 && <GoalRing fraction={active.actual / active.target} />}
      </Tile>,
    );
  }

  if (showSf && perf) {
    tiles.push(
      <Tile
        key="sf"
        href="/client/performance"
        icon={<Gift className="h-3.5 w-3.5" />}
        label="Support funds"
        sub={`${money(perf.window.sfUsed)} redeemed · ${perf.company.sfPercent ?? 0}% of qualifying purchases`}
      >
        {money(perf.window.sfEarned)}
      </Tile>,
    );
  }

  const cols =
    tiles.length === 4 ? 'lg:grid-cols-4' : tiles.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';

  return <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols} gap-4`}>{tiles}</div>;
}
