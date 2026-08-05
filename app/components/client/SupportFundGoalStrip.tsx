'use client';

/**
 * Dashboard strip: support funds this year + the active goal with its
 * "reaching it earns ≈$X" projection (owner: credit and goals should be
 * visible in several places, not buried in Performance). Renders nothing
 * while loading or when the caller lacks the reports permission — the
 * dashboard must not degrade for DAM-only or orders-only users.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Gift, Target } from 'lucide-react';

import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import type { CompanyPerformance } from '../../../lib/companyPerformance';
import { Card, CardContent } from '../qq/card';

const money = (n: number) =>
  `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function SupportFundGoalStrip() {
  const [data, setData] = useState<CompanyPerformance | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth('/api/client/performance?window=this-year');
        if (!res.ok) return; // no reports permission / any failure → stay hidden
        const payload = await res.json();
        if (!cancelled) setData(payload);
      } catch {
        /* stay hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  const todayISO = new Date().toISOString().slice(0, 10);
  const active = data.periods.find((p) => p.startDate <= todayISO && todayISO <= p.endDate);
  const isEnrolled = data.company.isEnrolled;
  const sfPercent = data.company.sfPercent ?? 0;
  const remaining = active ? Math.max(0, active.target - active.actual) : 0;
  const projection = isEnrolled && sfPercent > 0 ? (remaining * sfPercent) / 100 : 0;

  if (!isEnrolled && !active) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {isEnrolled && (
        <Link href="/client/performance" className="block">
          <Card className="h-full border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50 transition-colors">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Gift className="h-3.5 w-3.5 text-emerald-700" /> Support funds this year
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-800">
                {money(data.window.sfEarned)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">earned</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {money(data.window.sfUsed)} redeemed · {sfPercent}% of qualifying purchases
              </p>
            </CardContent>
          </Card>
        </Link>
      )}

      {active && (
        <Link href="/client/performance" className="block">
          <Card className="h-full hover:bg-secondary/40 transition-colors">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" /> {active.periodName || 'Current'} goal
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {money(active.actual)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  of {money(active.target)}
                </span>
              </p>
              <p className="text-xs mt-1">
                {remaining > 0 ? (
                  projection > 0 ? (
                    <span className="text-emerald-800 font-medium">
                      Reaching it earns ≈ {money(projection)} more in support funds
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{money(remaining)} to go</span>
                  )
                ) : (
                  <span className="text-emerald-800 font-medium">Goal reached 🎉</span>
                )}
              </p>
            </CardContent>
          </Card>
        </Link>
      )}
    </div>
  );
}
