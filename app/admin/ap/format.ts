/** Amount in its own currency: "$34.35", "₪679.91", "€4,180.00". */
export function money(amount: number | string | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);
  } catch {
    return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency ?? ''}`.trim();
  }
}

/** Status labels and badge styles for AP documents. */
export const STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' | 'destructive' | 'accent' }> = {
  received: { label: 'Waiting to be read', variant: 'muted' },
  reading: { label: 'Reading…', variant: 'accent' },
  needs_review: { label: 'Needs review', variant: 'warning' },
  posting: { label: 'Posting…', variant: 'accent' },
  posted: { label: 'Posted', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'muted' },
  not_invoice: { label: 'Not an invoice', variant: 'muted' },
  unpaid: { label: 'Unpaid — handle manually', variant: 'warning' },
  duplicate: { label: 'Already in NetSuite', variant: 'muted' },
  attached: { label: 'Attached to its invoice', variant: 'muted' },
  error: { label: 'Error', variant: 'destructive' },
};
