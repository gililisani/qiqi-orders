'use client';

/**
 * "Annual targets & progress" — the same card admins see on the company
 * drill-down, partner-facing. Numbers come from the client performance API
 * (server-scoped to the caller's company). Hidden silently when the user
 * lacks the reports permission or no periods exist.
 */

import { useEffect, useState } from 'react';

import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import type { CompanyPerformance } from '../../../lib/companyPerformance';
import { Card, CardContent, CardHeader, CardTitle } from '../qq/card';
import { Badge } from '../qq/badge';

const money = (n: number) => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export function AnnualTargetsCard() {
  const [data, setData] = useState<CompanyPerformance | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth('/api/client/performance?window=this-month');
        if (!res.ok) return;
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

  if (!data || data.periods.length === 0) return null;

  const now = new Date();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Annual targets &amp; progress</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.periods.map((p) => {
            const pct = Math.round(p.progressPct);
            const endDate = new Date(`${p.endDate}T23:59:59`);
            const isEnded = now > endDate;
            const daysRemaining = isEnded
              ? 0
              : Math.ceil((endDate.getTime() - now.getTime()) / 86400000);
            return (
              <div key={p.periodId} className="border border-border rounded-md p-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <div className="flex items-center flex-wrap gap-2">
                      <h3 className="text-sm font-medium">{p.periodName}</h3>
                      {isEnded ? (
                        <Badge variant="muted" className="text-[10px]">Ended</Badge>
                      ) : (
                        <Badge variant="accent" className="text-[10px]">
                          {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} to go
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(p.startDate).toLocaleDateString()} —{' '}
                      {new Date(p.endDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right whitespace-nowrap">
                    <div className="text-sm font-mono">
                      {money(p.actual)} / {money(p.target)}
                    </div>
                    <div className="text-xs text-muted-foreground">{pct}%</div>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-1.5 bg-foreground"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
