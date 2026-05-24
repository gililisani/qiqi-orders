'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

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
        : 'text-gray-500 bg-gray-50';

  return (
    <div className="bg-white border border-[#e5e5e5] rounded-xl px-5 py-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-semibold text-gray-900">{value}</div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className={['inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md', color].join(' ')}>
          <Icon className="h-3 w-3" />
          {deltaPct == null ? '—' : `${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%`}
        </span>
        <span className="text-gray-500">{hint ?? 'vs prior period'}</span>
      </div>
    </div>
  );
}
