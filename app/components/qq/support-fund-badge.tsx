'use client';

import * as React from 'react';
import { cn } from '../../../lib/utils';

/**
 * SupportFundBadge — shows the support-fund percentage for a company / order.
 * Periwinkle tint to signal "this is a Qiqi-specific value, not a generic stat".
 */

export interface SupportFundBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  percent: number;
  /** Show the currency-amount alongside the percent (e.g. "10% · $960"). */
  amount?: string | null;
}

export function SupportFundBadge({ percent, amount, className, ...props }: SupportFundBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-brand-periwinkle/30 ' +
          'bg-brand-periwinkle/10 px-2 py-0.5 text-xs font-medium text-brand-periwinkle',
        className
      )}
      {...props}
    >
      <span className="font-mono">{percent}%</span>
      {amount && (
        <>
          <span className="text-brand-periwinkle/50">·</span>
          <span className="font-mono">{amount}</span>
        </>
      )}
      <span className="hidden sm:inline">SF</span>
    </span>
  );
}
