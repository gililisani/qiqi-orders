import Stripe from 'stripe';

/**
 * Stripe client + helpers for the credit-card payment flow. Server-only — the
 * secret key never reaches the browser. We use Stripe **Invoices** (not Payment
 * Links / Checkout): per-order, exact amount, hosted payment page that stays
 * valid until paid or voided, Stripe emails it, and void+reissue on change.
 *
 * Amounts are always integer cents.
 */
export function createStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set. Add the Stripe secret key to the environment.');
  }
  return new Stripe(key);
}

/** Dollars → integer cents, rounded to the nearest cent. */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export interface StripeInvoiceLine {
  description: string;
  amountCents: number;
}

export interface CreatedStripeInvoice {
  invoiceId: string;
  number: string | null;
  hostedUrl: string | null;
  status: string | null;
  totalCents: number;
}

/**
 * Reuse the company's Stripe customer if it still exists, otherwise create one.
 * Returns the customer id to cache on the company.
 */
export async function ensureCustomer(
  stripe: Stripe,
  opts: {
    existingId?: string | null;
    name: string;
    email?: string | null;
    metadata?: Record<string, string>;
  },
): Promise<string> {
  if (opts.existingId) {
    try {
      const c = await stripe.customers.retrieve(opts.existingId);
      if (!(c as Stripe.DeletedCustomer).deleted) return opts.existingId;
    } catch {
      // Not found / deleted — fall through and create a fresh one.
    }
  }
  const created = await stripe.customers.create({
    name: opts.name,
    email: opts.email || undefined,
    metadata: opts.metadata,
  });
  return created.id;
}

/**
 * Create + finalize a one-off invoice for an order. Items attach to THIS
 * invoice only (we exclude any unrelated pending items on the customer).
 * Finalizing generates the hosted payment page URL + the invoice number.
 * Does NOT email — call sendInvoiceEmail separately if you want Stripe to send.
 */
export async function createOrderInvoice(
  stripe: Stripe,
  opts: {
    customerId: string;
    lines: StripeInvoiceLine[];
    currency?: string;
    daysUntilDue?: number;
    description?: string;
    metadata?: Record<string, string>;
  },
): Promise<CreatedStripeInvoice> {
  const currency = opts.currency || 'usd';

  // 1. Create the invoice shell (send_invoice = hosted link + emailable, due
  //    in N days so the client can pay later). Exclude stray pending items.
  const invoice = await stripe.invoices.create({
    customer: opts.customerId,
    collection_method: 'send_invoice',
    days_until_due: opts.daysUntilDue ?? 2,
    auto_advance: false,
    description: opts.description,
    metadata: opts.metadata,
    pending_invoice_items_behavior: 'exclude',
  });
  const invoiceId = invoice.id as string;

  // 2. Attach the line items to this specific invoice.
  for (const line of opts.lines) {
    await stripe.invoiceItems.create({
      customer: opts.customerId,
      invoice: invoiceId,
      amount: Math.round(line.amountCents),
      currency,
      description: line.description,
    });
  }

  // 3. Finalize → hosted_invoice_url + number become available.
  const finalized = await stripe.invoices.finalizeInvoice(invoiceId, { auto_advance: false });

  return {
    invoiceId: finalized.id as string,
    number: finalized.number ?? null,
    hostedUrl: finalized.hosted_invoice_url ?? null,
    status: finalized.status ?? null,
    totalCents: finalized.total,
  };
}

/** Email the finalized invoice (hosted payment link) to the customer via Stripe. */
export async function sendInvoiceEmail(stripe: Stripe, invoiceId: string): Promise<void> {
  await stripe.invoices.sendInvoice(invoiceId);
}

/** Void an open/finalized invoice (used on order change → void + reissue). */
export async function voidInvoice(stripe: Stripe, invoiceId: string): Promise<void> {
  await stripe.invoices.voidInvoice(invoiceId);
}

export async function getInvoice(stripe: Stripe, invoiceId: string): Promise<Stripe.Invoice> {
  return stripe.invoices.retrieve(invoiceId);
}
