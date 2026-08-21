/**
 * Store-timezone dates. NS transaction dates must match the SHOPIFY
 * STORE's calendar (America/New_York), not UTC: an order placed 10:24pm
 * ET Aug 20 is a UTC timestamp of Aug 21 02:24 — booking it as Aug 21
 * shifts revenue across day (and at month end, period) boundaries vs
 * Shopify's own reports (owner directive 2026-08-21, found on #7277).
 *
 * Payout ISSUE dates are exempt: Shopify states them as nominal calendar
 * dates (Monday 00:00:00Z) — converting would shift them to Sunday.
 */
export const STORE_TIMEZONE = 'America/New_York';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** ISO timestamp (any zone) → YYYY-MM-DD in the store's timezone. */
export function storeDate(iso: string): string {
  return fmt.format(new Date(iso));
}
