'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card, CardContent } from '../../../components/qq/card';

export interface KpiCardProps {
  label: string;
  value: string;
  deltaPct: number | null;
  hint?: string;
}

export default function KpiCard({ label, value, deltaPct, hint }: KpiCardProps) {
  const direction =
    deltaPct == null ? 'flat' : deltaPct > 0.5 ? 'up' : deltaPct < -0.5 ? 'down' : 'flat';

  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  const color =
    direction === 'up'
      ? 'text-emerald-600 bg-emerald-50'
      : direction === 'down'
        ? 'text-rose-600 bg-rose-50'
        : 'text-muted-foreground bg-secondary';

  return (
    <Card>
      <CardContent className="p-4 pt-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">{value}</p>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className={['inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md', color].join(' ')}>
            <Icon className="h-3 w-3" />
            {deltaPct == null ? '—' : `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`}
          </span>
          <span className="text-muted-foreground">{hint ?? 'vs prior period'}</span>
        </div>
      </CardContent>
    </Card>
  );
}
