'use client';

import * as React from 'react';
import { cn } from '../../../lib/utils';

/**
 * StatusBadge — single source of truth for how each order status looks.
 * Used in tables, detail headers, history entries. Anywhere a status appears.
 *
 * Color philosophy:
 *  - Draft       → muted (the order isn't really an order yet)
 *  - Open        → Periwinkle (Qiqi accent — "new, fresh, in your inbox")
 *  - In Process  → amber (in motion, action elsewhere)
 *  - Ready       → emerald-faint (almost done, awaits client)
 *  - Done        → emerald-solid (terminal positive)
 *  - Cancelled   → Magenta (terminal negative — Qiqi destructive)
 */

export type OrderStatus =
  | 'Draft'
  | 'Open'
  | 'In Process'
  | 'Ready'
  | 'Done'
  | 'Cancelled';

// Note: explicit hex values are used for emerald/sky/amber because Material Tailwind's
// `withMT()` wrapper sometimes strips colors that aren't referenced elsewhere from the
// JIT output. Using arbitrary-value classes (`bg-[#...]`) bypasses that and guarantees
// the styles render.
const STATUS_STYLES: Record<OrderStatus, string> = {
  Draft:        'bg-secondary text-muted-foreground border-border',
  Open:         'bg-brand-periwinkle/15 text-brand-periwinkle border-brand-periwinkle/30',
  'In Process': 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]',
  Ready:        'bg-[#DBEAFE] text-[#1D4ED8] border-[#BFDBFE]',
  Done:         'bg-[#D1FAE5] text-[#065F46] border-[#A7F3D0]',
  Cancelled:    'bg-brand-magenta/15 text-brand-magenta border-brand-magenta/40',
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: OrderStatus | string; // accept string for flexibility, fall back to muted
}

export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const style = (STATUS_STYLES as Record<string, string>)[status] || STATUS_STYLES.Draft;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm border px-2 py-0.5 text-xs font-medium',
        style,
        className
      )}
      {...props}
    >
      {status}
    </span>
  );
}
