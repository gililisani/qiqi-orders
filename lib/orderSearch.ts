/**
 * Order list search (admin + client lists) — one free-text term matched
 * against everything a user would type to find an order.
 *
 * A term is either a DATE (whole term, filters the day) or matched with OR
 * across: PO number, NetSuite SO number, invoice number, the companies whose
 * name / NetSuite number match (admin), and — only when the term reads as a
 * money amount — the order total. Identifiers like "SOUS17468" or "A1JK6D"
 * contain digits; they must never be turned into an amount search (the bug
 * this replaces: digits were stripped out and only total_value was searched).
 */

const DATE_RE = /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\d{2}-\d{2}-\d{4})$/;
const AMOUNT_RE = /^\$?\s*(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/;

/** The whole term as a YYYY-MM-DD day (US M/D/Y for slash/dash forms), or null. */
export function parseSearchDate(term: string): string | null {
  const t = term.trim();
  if (!DATE_RE.test(t)) return null;
  if (/^\d{4}-/.test(t)) return t;
  const [m, d, y] = t.split(/[/-]/);
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** The whole term as a money amount ("1704", "1,704.50", "$84"), or null. */
export function parseSearchAmount(term: string): number | null {
  const t = term.trim();
  if (!AMOUNT_RE.test(t)) return null;
  const n = Number(t.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Strip characters that would break a PostgREST or() filter. */
export function sanitizeSearchTerm(term: string): string {
  return term.replace(/[(),"\\*%:]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * PostgREST `or` filter for a non-date term (empty string = no filter).
 * `companyIds`: companies the term matched by name/number (admin only).
 */
export function buildOrderSearchOr(term: string, companyIds: string[] = []): string {
  const t = sanitizeSearchTerm(term);
  if (!t) return '';
  const like = `"%${t}%"`;
  const parts = [`po_number.ilike.${like}`, `so_number.ilike.${like}`, `invoice_number.ilike.${like}`];
  if (companyIds.length > 0) parts.push(`company_id.in.(${companyIds.join(',')})`);
  const amount = parseSearchAmount(term);
  if (amount !== null) {
    parts.push(`and(total_value.gte.${(amount - 0.01).toFixed(2)},total_value.lte.${(amount + 0.01).toFixed(2)})`);
  }
  return parts.join(',');
}

/**
 * The same search for rows that aren't Hub orders (client order list:
 * invoices billed externally): a date term matches the day, an amount term
 * matches the total (±1¢), anything else matches the document number.
 */
export function matchesSearch(term: string, row: { number: string; date: string; total: number }): boolean {
  const t = term.trim();
  if (!t) return true;
  const day = parseSearchDate(t);
  if (day) return row.date.slice(0, 10) === day;
  const amount = parseSearchAmount(t);
  if (amount !== null && Math.abs(row.total - amount) <= 0.01) return true;
  const needle = sanitizeSearchTerm(t).toLowerCase();
  return !!needle && row.number.toLowerCase().includes(needle);
}
