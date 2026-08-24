/**
 * 100501 STATEMENT — Shopify Payments balance transactions → "bank
 * statement" lines for the Shopify clearing account, rendered as OFX for
 * NetSuite's Banking Import / Financial Institution Connectivity.
 *
 * Part 1 of the reconciliation (owner, 2026-08-23): NetSuite's Match
 * Bank Data needs a statement line on the left for every posting on the
 * right. Each line here mirrors exactly one NS posting the engine (or
 * NetScore, after the 2026 clean-up) made in 100501:
 *
 *   CHARGE                 → customer payment (gross, order date)
 *   REFUND                 → customer refund (gross, refund date)
 *   TRANSFER (payout)      → payout journal, bank leg (−net, payout date)
 *   fees of a payout       → fee vendor-bill payment (−Σ fee, payout date)   [synthetic]
 *   TAX_ADJUSTMENT_* of a payout → journal marketplace-tax leg (Σ gross)      [synthetic]
 *   DISPUTE_* of a payout  → journal chargeback leg (Σ gross)                [synthetic]
 *   anything else          → one line per transaction (gross), memo = type
 *
 * Fees/tax/disputes are aggregated PER PAYOUT because that is how the
 * engine posts them; transactions not yet in a payout contribute no
 * synthetic line until their payout exists (the next pull picks it up —
 * FITIDs are stable, NetSuite de-duplicates on re-import).
 *
 * Pure: no I/O. Dates are store dates (America/New_York) so they equal
 * the NS transaction dates the engine writes.
 */
import { toCents, centsToDecimal } from './money';
import { storeDate } from './dates';
import type { ShopifyBalanceTxn } from './payoutTransform';

export interface StatementLine {
  /** Unique, stable id (OFX FITID) — re-imports de-duplicate on it. */
  fitId: string;
  /** Store date YYYY-MM-DD. */
  date: string;
  /** Signed cents: positive = money into the Shopify balance. */
  cents: number;
  /** OFX TRNTYPE. */
  trnType: 'CREDIT' | 'DEBIT' | 'FEE' | 'XFER';
  /** Short label (OFX NAME, ≤32 chars). */
  name: string;
  memo: string;
  orderName: string | null;
  payoutId: string | null;
}

export interface StatementOptions {
  /** Inclusive store-date window; lines outside are dropped. */
  from?: string;
  to?: string;
  /** Payout issue dates by payout gid (for the synthetic per-payout lines). Falls back to the TRANSFER date. */
  payoutDates?: Map<string, string>;
}

const gidNum = (gid: string) => gid.replace(/^.*\//, '');

export function buildStatementLines(txns: ShopifyBalanceTxn[], opts: StatementOptions = {}): StatementLine[] {
  const lines: StatementLine[] = [];
  const perPayout = new Map<string, { fee: number; tax: number; dispute: number; date: string | null }>();
  const bucket = (pid: string) => perPayout.get(pid) ?? perPayout.set(pid, { fee: 0, tax: 0, dispute: 0, date: null }).get(pid)!;

  for (const t of txns) {
    if (t.test) continue;
    const date = storeDate(t.transactionDate);
    const pid = t.associatedPayout?.id ?? null;
    const order = t.associatedOrder?.name ?? null;
    const gross = toCents(t.amount.amount);
    const fee = toCents(t.fee.amount);
    const net = toCents(t.net.amount);
    if (pid && fee !== 0 && t.type !== 'TRANSFER') bucket(pid).fee += fee;

    switch (t.type) {
      case 'CHARGE':
        lines.push({ fitId: `bt-${gidNum(t.id)}`, date, cents: gross, trnType: 'CREDIT', name: `Shopify order ${order ?? ''}`.trim(), memo: `Charge ${order ?? ''} · fee ${t.fee.amount}`.trim(), orderName: order, payoutId: pid });
        break;
      case 'REFUND':
        lines.push({ fitId: `bt-${gidNum(t.id)}`, date, cents: gross, trnType: 'DEBIT', name: `Shopify refund ${order ?? ''}`.trim(), memo: `Refund ${order ?? ''}`.trim(), orderName: order, payoutId: pid });
        break;
      case 'TRANSFER': {
        // The payout itself: −net leaves the balance on the payout date.
        const id = pid ? gidNum(pid) : gidNum(t.id);
        const payoutDate = (pid && opts.payoutDates?.get(pid)) || date;
        if (pid) bucket(pid).date = payoutDate;
        lines.push({ fitId: `payout-${id}`, date: payoutDate, cents: net, trnType: 'XFER', name: `Shopify payout ${id}`, memo: `Payout ${id} net to bank`, orderName: null, payoutId: pid });
        break;
      }
      default:
        // GROSS everywhere (fees ride in the per-payout fee line) — mirrors
        // the engine: gross customer payments, one fee bill, gross tax/
        // dispute legs.
        if (pid && t.type.startsWith('TAX_ADJUSTMENT')) { bucket(pid).tax += gross; break; }
        if (pid && t.type.startsWith('DISPUTE')) { bucket(pid).dispute += gross; break; }
        lines.push({ fitId: `bt-${gidNum(t.id)}`, date, cents: gross, trnType: gross >= 0 ? 'CREDIT' : 'DEBIT', name: `Shopify ${t.type.toLowerCase().replace(/_/g, ' ')}`.slice(0, 32), memo: `${t.type}${order ? ` ${order}` : ''}${t.adjustmentReason ? ` · ${t.adjustmentReason}` : ''}`, orderName: order, payoutId: pid });
    }
  }

  // Synthetic per-payout lines (only for payouts whose TRANSFER we saw, or whose date was supplied).
  for (const [pid, b] of perPayout) {
    const id = gidNum(pid);
    const date = opts.payoutDates?.get(pid) ?? b.date;
    if (!date) continue;
    if (b.fee !== 0) lines.push({ fitId: `fee-${id}`, date, cents: -b.fee, trnType: 'FEE', name: `Shopify fees payout ${id}`.slice(0, 32), memo: `Processing fees · payout ${id}`, orderName: null, payoutId: pid });
    if (b.tax !== 0) lines.push({ fitId: `tax-${id}`, date, cents: b.tax, trnType: b.tax >= 0 ? 'CREDIT' : 'DEBIT', name: `Shopify marketplace tax ${id}`.slice(0, 32), memo: `Shop-remitted marketplace tax · payout ${id}`, orderName: null, payoutId: pid });
    if (b.dispute !== 0) lines.push({ fitId: `dispute-${id}`, date, cents: b.dispute, trnType: b.dispute >= 0 ? 'CREDIT' : 'DEBIT', name: `Shopify disputes payout ${id}`.slice(0, 32), memo: `Chargebacks/disputes · payout ${id}`, orderName: null, payoutId: pid });
  }

  const inWindow = (d: string) => (!opts.from || d >= opts.from) && (!opts.to || d <= opts.to);
  return lines.filter((l) => l.cents !== 0 && inWindow(l.date)).sort((a, b) => a.date.localeCompare(b.date) || a.fitId.localeCompare(b.fitId));
}

export interface OfxOptions {
  bankId?: string;
  acctId?: string;
  /** Statement period (YYYY-MM-DD). */
  from: string;
  to: string;
  /** Closing balance in cents (Shopify pending balance) — informational for NetSuite. */
  ledgerBalanceCents?: number;
  /** Generation timestamp — injectable for tests. */
  now?: Date;
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ofxDate = (d: string) => `${d.replace(/-/g, '')}120000`;

/** OFX 2.x (XML) bank statement — accepted by NetSuite's "OFX/QFX Plugin Implementation" parser. */
export function renderOfx(lines: StatementLine[], opts: OfxOptions): string {
  const now = opts.now ?? new Date();
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const bankId = opts.bankId ?? 'SHOPIFY';
  const acctId = opts.acctId ?? 'shopify-payments';
  const trn = lines
    .map(
      (l) => `        <STMTTRN>
          <TRNTYPE>${l.trnType}</TRNTYPE>
          <DTPOSTED>${ofxDate(l.date)}</DTPOSTED>
          <TRNAMT>${centsToDecimal(l.cents)}</TRNAMT>
          <FITID>${xml(l.fitId)}</FITID>
          <NAME>${xml(l.name.slice(0, 32))}</NAME>
          <MEMO>${xml(l.memo.slice(0, 255))}</MEMO>
        </STMTTRN>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <SIGNONMSGSRSV1>
    <SONRS>
      <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
      <DTSERVER>${stamp}</DTSERVER>
      <LANGUAGE>ENG</LANGUAGE>
      <FI><ORG>Shopify Payments</ORG><FID>SHOPIFY</FID></FI>
    </SONRS>
  </SIGNONMSGSRSV1>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <TRNUID>${stamp}</TRNUID>
      <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
      <STMTRS>
        <CURDEF>USD</CURDEF>
        <BANKACCTFROM><BANKID>${bankId}</BANKID><ACCTID>${acctId}</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>
        <BANKTRANLIST>
        <DTSTART>${ofxDate(opts.from)}</DTSTART>
        <DTEND>${ofxDate(opts.to)}</DTEND>
${trn}
        </BANKTRANLIST>
        <LEDGERBAL><BALAMT>${centsToDecimal(opts.ledgerBalanceCents ?? 0)}</BALAMT><DTASOF>${ofxDate(opts.to)}</DTASOF></LEDGERBAL>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
`;
}

import type { GatewayTxn } from '../statementFetch';

/**
 * PayPal/Affirm statement lines (Phase A): one line per successful order
 * charge/refund, mirroring the engine's customer payments/refunds in
 * 100504/100503. Naming matches the Shopify feed so the same
 * reconciliation rules apply.
 */
export function buildGatewayStatementLines(txns: Pick<GatewayTxn, 'id' | 'orderName' | 'kind' | 'processedAt' | 'amount'>[], opts: { from?: string; to?: string } = {}): StatementLine[] {
  const lines: StatementLine[] = [];
  for (const t of txns) {
    const date = storeDate(t.processedAt);
    const cents = toCents(t.amount);
    if (cents === 0) continue;
    const refund = t.kind === 'REFUND';
    lines.push({
      fitId: `gw-${t.id}`,
      date,
      cents: refund ? -Math.abs(cents) : Math.abs(cents),
      trnType: refund ? 'DEBIT' : 'CREDIT',
      name: `${refund ? 'Shopify refund' : 'Shopify order'} ${t.orderName}`.slice(0, 32),
      memo: `${refund ? 'Refund' : 'Charge'} ${t.orderName}`,
      orderName: t.orderName,
      payoutId: null,
    });
  }
  const inWindow = (d: string) => (!opts.from || d >= opts.from) && (!opts.to || d <= opts.to);
  return lines.filter((l) => inWindow(l.date)).sort((a, b) => a.date.localeCompare(b.date) || a.fitId.localeCompare(b.fitId));
}
