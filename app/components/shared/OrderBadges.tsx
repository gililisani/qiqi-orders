'use client';

/**
 * OrderBadges — renders the derived money / package / hold chips next to a
 * status badge (status/badge redesign 2026-09-06). Derivation lives in
 * lib/orderBadges.ts; this is presentation only. Used on admin + client
 * order details and list rows.
 */

import { deriveOrderBadges, type OrderBadgeFields, type OrderBadgeTone } from '../../../lib/orderBadges';
import { Badge } from '../qq/badge';

const TONE_VARIANT: Record<OrderBadgeTone, 'outline' | 'success' | 'warning' | 'destructive'> = {
  neutral: 'outline',
  positive: 'success',
  attention: 'warning',
  negative: 'destructive',
};

/** List-row variant: only the hold chip — the actionable bit. Status and
 *  money live in their own columns there; a full chip row would be noise. */
export function HoldBadge({ hold }: { hold?: string | null }) {
  if (hold === 'awaiting_client') return <Badge variant="warning">Awaiting client</Badge>;
  if (hold === 'payment_hold') return <Badge variant="destructive">Payment hold</Badge>;
  return null;
}

export function OrderBadges({ order, className }: { order: OrderBadgeFields; className?: string }) {
  const chips = deriveOrderBadges(order);
  if (chips.length === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap ${className ?? ''}`}>
      {chips.map((c) => (
        <Badge key={c.key} variant={TONE_VARIANT[c.tone]}>
          {c.label}
        </Badge>
      ))}
    </span>
  );
}
