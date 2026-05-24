'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '../../../../lib/utils';

/**
 * PeriodSelector — preset windows + an optional Custom date range.
 *
 * URL contract: writes `window` (30d|90d|ytd|custom) and, when custom,
 * `from` + `to` (YYYY-MM-DD). When the user picks a preset, `from`/`to`
 * are cleared. Default `basePath` is /admin/reports, override per page.
 */

const PRESETS: Array<{ key: '30d' | '90d' | 'ytd'; label: string }> = [
  { key: '30d', label: 'Last 30d' },
  { key: '90d', label: 'Last 90d' },
  { key: 'ytd', label: 'YTD' },
];

interface Props {
  current: string;       // current `window` value
  basePath: string;      // e.g. /admin/reports
  defaultFromDays?: number; // when switching to Custom, prefill from = today - N days. Default 30.
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function PeriodSelector({
  current,
  basePath,
  defaultFromDays = 30,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  // Local state for the two date inputs so typing doesn't navigate on every keystroke.
  const fromParam = sp.get('from') ?? '';
  const toParam = sp.get('to') ?? '';
  const [from, setFrom] = useState(fromParam || daysAgoISO(defaultFromDays));
  const [to, setTo] = useState(toParam || todayISO());

  useEffect(() => {
    if (fromParam) setFrom(fromParam);
    if (toParam) setTo(toParam);
  }, [fromParam, toParam]);

  const push = (params: URLSearchParams) => {
    router.push(`${basePath}?${params.toString()}`);
  };

  const pickPreset = (key: string) => {
    const params = new URLSearchParams(sp.toString());
    params.set('window', key);
    params.delete('from');
    params.delete('to');
    push(params);
  };

  const switchToCustom = () => {
    const params = new URLSearchParams(sp.toString());
    params.set('window', 'custom');
    params.set('from', from);
    params.set('to', to);
    push(params);
  };

  const applyCustom = () => {
    if (!from || !to) return;
    const params = new URLSearchParams(sp.toString());
    params.set('window', 'custom');
    params.set('from', from);
    params.set('to', to);
    push(params);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-border bg-card p-1">
        {PRESETS.map((p) => {
          const active = current === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => pickPreset(p.key)}
              className={cn(
                'px-3 py-1.5 text-sm rounded transition-colors',
                active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
              )}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={switchToCustom}
          className={cn(
            'px-3 py-1.5 text-sm rounded transition-colors',
            current === 'custom'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
          )}
        >
          Custom
        </button>
      </div>

      {current === 'custom' && (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
            aria-label="From date"
          />
          <span className="text-muted-foreground text-sm">→</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            max={todayISO()}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
            aria-label="To date"
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!from || !to || (from === fromParam && to === toParam)}
            className={cn(
              'ml-1 h-9 rounded-md px-3 text-sm font-medium transition-colors',
              !from || !to || (from === fromParam && to === toParam)
                ? 'bg-secondary text-muted-foreground cursor-not-allowed'
                : 'bg-foreground text-background hover:bg-foreground/90',
            )}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
