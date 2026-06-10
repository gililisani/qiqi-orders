/**
 * NetSuite "Allow Web Query" feed — the TRUSTED source of on-hand / negatives.
 *
 * SERVER-ONLY. The feed URL embeds an auth `hash` (a credential) and must never
 * be exposed to the browser. Set it in env as NETSUITE_WEBQUERY_URL.
 *
 * WHY THIS EXISTS (hard-won, see memory/project_inventory_investigation):
 * NetSuite's consolidated QoH measure ("Qiqi ALL Stock Matrix", customreport_505)
 * is NOT reproducible by SuiteQL, saved searches, or a RESTlet — all give wrong
 * numbers because of phantom inventory movements the API can't see. The report's
 * "Allow Web Query" export is the ONLY trustworthy on-hand source. It serves the
 * report's own output over an authenticated URL with NO OAuth/session/password:
 * the `hash` + `email` pair IS the credential.
 *
 * The URL we use is bound to the admin@ service account (role 1254, QQ Partners
 * Hub Role) so it survives personnel changes. The report's "As of" date is saved
 * as the relative "Today", so the feed always returns CURRENT on-hand.
 *
 * CAVEAT: the feed carries no embedded as-of date. If someone re-sets the report
 * to a fixed date in the NetSuite UI, this feed goes stale with no error.
 *
 * Output shape: an HTML <table>, one row per (item, location) that has a value:
 *   col 0  Quantity On Hand   (Excel formula prefix "=", thousands commas)
 *   col 1  Name (Grouped)     = item code / SKU
 *   col 2  Display Name
 *   col 3  location           (header is literally the string "null")
 */
import axios from 'axios';

export interface StockRow {
  /** SKU, e.g. "FPS0020" (the report's "Name (Grouped)" column). */
  itemCode: string;
  /** Product display name. */
  displayName: string;
  /** Location / subsidiary name, e.g. "Square1 - Missouri". */
  location: string;
  /** On-hand quantity at this (item, location). Negative = the thing we hunt. */
  qoh: number;
}

// NetSuite sits behind Akamai bot protection; a bare client UA can be blocked,
// a normal browser UA passes fine.
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, (m) => ENTITY_MAP[m] ?? m);
}

function cellText(tdInner: string): string {
  return decodeEntities(tdInner.replace(/<[^>]+>/g, '')).trim();
}

/**
 * Parse a Quantity-On-Hand cell. NetSuite emits Excel formulas ("=-700",
 * "=13.75") with thousands commas. Returns null if not a number (e.g. blank
 * cell — the matrix is sparse, most (item,location) pairs are empty).
 */
function parseQoh(raw: string): number | null {
  const cleaned = raw.replace(/^=/, '').replace(/,/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * PURE parser — turn the web-query HTML table into typed rows. Skips the header
 * row and any row whose item code or quantity is missing/unparseable.
 */
export function parseStockMatrixHtml(html: string): StockRow[] {
  const rows: StockRow[] = [];
  const trMatches = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];

  for (const tr of trMatches) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cellText(m[1]));
    if (tds.length < 4) continue; // header has <td> too but parseQoh weeds it out

    const qoh = parseQoh(tds[0]);
    const itemCode = tds[1];
    if (qoh === null || !itemCode) continue; // header ("Quantity On Hand") + blanks

    rows.push({
      itemCode,
      displayName: tds[2],
      location: tds[3],
      qoh,
    });
  }

  return rows;
}

function resolveUrl(explicit?: string): string {
  const url = explicit ?? process.env.NETSUITE_WEBQUERY_URL;
  if (!url) {
    throw new Error(
      'NETSUITE_WEBQUERY_URL is not set. This is the NetSuite "Allow Web Query" ' +
        'feed URL for the Qiqi ALL Stock Matrix report (server-only secret).',
    );
  }
  return url;
}

/**
 * Shape guard: the feed has NO embedded as-of date or scope, so if someone
 * leaves the report on a past date or a narrower subsidiary view (it happened —
 * 538 rows/17 locations collapsed to 198/7 after a capture session), the feed
 * silently serves wrong data. A healthy full-catalog consolidated pull has had
 * 400+ rows across 14+ locations; reject anything far below that rather than
 * anchor the whole tool on a misconfigured report.
 */
export const FEED_MIN_ROWS = 350;
export const FEED_MIN_LOCATIONS = 10;

export class FeedShapeError extends Error {}

function assertFeedShape(rows: StockRow[]): void {
  const locations = new Set(rows.map((r) => r.location)).size;
  if (rows.length < FEED_MIN_ROWS || locations < FEED_MIN_LOCATIONS) {
    throw new FeedShapeError(
      `NetSuite report feed looks misconfigured: ${rows.length} rows / ${locations} locations ` +
        `(expected ≥${FEED_MIN_ROWS} rows / ≥${FEED_MIN_LOCATIONS} locations). The "Qiqi ALL Stock ` +
        `Matrix" report is probably saved with a past "As of" date or a narrower subsidiary view — ` +
        `open it in NetSuite, set As of = Today and Subsidiary Context = Qiqi Global Ltd. ` +
        `(Consolidated), and save.`,
    );
  }
}

/**
 * Fetch the full stock matrix from NetSuite and return every (item, location)
 * row that has a value. SERVER-ONLY.
 *
 * The shape guard rejects a misconfigured report (see above); pass
 * `skipShapeGuard` only for deliberate historical captures where the caller
 * eyeballs the result.
 */
export async function fetchStockMatrix(opts?: { url?: string; skipShapeGuard?: boolean }): Promise<StockRow[]> {
  const url = resolveUrl(opts?.url);
  const res = await axios.get<string>(url, {
    headers: { 'User-Agent': BROWSER_UA },
    responseType: 'text',
    // NetSuite returns 500 with an HTML "Unauthorized access" body on bad
    // credentials; don't let axios throw before we can give a clear message.
    validateStatus: () => true,
    timeout: 30_000,
  });

  const body = typeof res.data === 'string' ? res.data : String(res.data);
  if (res.status !== 200 || /Unauthorized access/i.test(body)) {
    throw new Error(
      `NetSuite web query failed (HTTP ${res.status}). The hash/email may be ` +
        `wrong, expired, or "Allow Web Query" was disabled on the report. ` +
        `Body starts: ${body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)}`,
    );
  }

  const rows = parseStockMatrixHtml(body);
  if (rows.length === 0) {
    throw new Error(
      'NetSuite web query returned 200 but no parseable rows — the report output ' +
        'format may have changed (parser expects QoH | itemCode | name | location).',
    );
  }
  if (!opts?.skipShapeGuard) assertFeedShape(rows);
  return rows;
}

/**
 * Just the negatives — the worklist's primary input. Sorted most-negative first.
 */
export async function fetchNegativeStock(opts?: { url?: string }): Promise<StockRow[]> {
  const all = await fetchStockMatrix(opts);
  return all.filter((r) => r.qoh < 0).sort((a, b) => a.qoh - b.qoh);
}
