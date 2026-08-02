'use client';

/**
 * Shared visuals for target-period status — used by the Company Performance
 * report AND the per-company drill-down so the two views always look (and
 * mean) the same. The status *rules* live in lib/companyPerformance.ts
 * (classifyStatus) — one source of truth for both APIs.
 */

import {
  CheckCircle2,
  Clock,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { cn } from '../../../../lib/utils';
import type { PeriodStatus } from '../../../../lib/companyPerformance';

const STATUS_STYLES: Record<PeriodStatus, { className: string; Icon: any }> = {
  Ahead: { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: TrendingUp },
  'On Track': { className: 'bg-secondary text-muted-foreground border-border', Icon: CheckCircle2 },
  Slipping: { className: 'bg-amber-50 text-amber-700 border-amber-200', Icon: TrendingDown },
  Fail: { className: 'bg-rose-50 text-rose-700 border-rose-200', Icon: XCircle },
  Complete: { className: 'bg-[#D1FAE5] text-[#065F46] border-[#A7F3D0]', Icon: CheckCircle2 },
  'Not Started': { className: 'bg-secondary text-muted-foreground border-border', Icon: Clock },
};

export function StatusPill({ status }: { status: PeriodStatus }) {
  const { className, Icon } = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

export function ProgressBar({ pct, expectedPct }: { pct: number; expectedPct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const expectedClamped = Math.max(0, Math.min(100, expectedPct));
  const onPace = pct >= expectedPct - 20;
  return (
    <div>
      <div className="relative h-2 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', onPace ? 'bg-emerald-500' : 'bg-rose-500')}
          style={{ width: `${clamped}%` }}
        />
        <div
          className="absolute top-0 h-full w-px bg-foreground/40"
          style={{ left: `${expectedClamped}%` }}
          title={`Expected at this point: ${expectedPct.toFixed(0)}%`}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{pct.toFixed(0)}%</span>
        <span>exp {expectedPct.toFixed(0)}%</span>
      </div>
    </div>
  );
}
