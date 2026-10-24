/**
 * What the reader extracts from a vendor invoice. Amounts are numbers in the
 * invoice's own currency; anything not printed on the document is null —
 * the reader never guesses.
 *
 * Two shapes: the schema sent to the model (text fields are "" when absent —
 * structured output caps how many nullable fields a schema may have) and the
 * normalized InvoiceExtraction the Hub works with ("" → null).
 */
import { z } from 'zod';

const amount = z.number().nullable();
/** Text field; "" when the document doesn't show it. */
const text = z.string();

export const ReaderOutputSchema = z.object({
  /** False for statements, quotes, order confirmations, newsletters, etc. */
  is_invoice: z.boolean(),
  document_type: z.enum(['invoice', 'receipt', 'credit_note', 'statement', 'quote', 'other']),
  vendor: z.object({
    name: text,
    /** The same name in Latin letters when printed in another script (Hebrew…). */
    name_latin: text,
    tax_id: text,
    email: text,
    website: text,
    country: text,
  }),
  /** Who the invoice is addressed to. */
  bill_to: z.object({ name: text, country: text }),
  invoice_number: text,
  /** YYYY-MM-DD */
  invoice_date: text,
  due_date: text,
  /** ISO 4217, e.g. USD, ILS, EUR */
  currency: text,
  service_period: z.object({ from: text, to: text }),
  lines: z.array(
    z.object({
      description: z.string(),
      quantity: amount,
      unit_price: amount,
      /** Line amount before tax. */
      amount: z.number(),
      tax_rate_percent: amount,
    }),
  ),
  subtotal: amount,
  tax_lines: z.array(z.object({ name: z.string(), rate_percent: amount, amount: z.number() })),
  tax_total: amount,
  total: amount,
  amount_paid: amount,
  amount_due: amount,
  payment: z.object({
    status: z.enum(['paid', 'unpaid', 'partially_paid', 'unknown']),
    method: z.enum(['card', 'bank_transfer', 'direct_debit', 'paypal', 'other', 'unknown']),
    card_brand: text,
    /** Only when printed on the document. */
    card_last4: text,
    paid_date: text,
  }),
  /** Language the document is written in, e.g. "en", "he". */
  language: text,
  /** Anything a bookkeeper should notice: unreadable parts, totals that don't add up, odd items. */
  warnings: z.array(z.string()),
});

type Raw = z.infer<typeof ReaderOutputSchema>;
type Nullify<T> = T extends string ? string | null : T extends Array<infer U> ? Array<Nullify<U>> : T extends object ? { [K in keyof T]: Nullify<T[K]> } : T;

export type InvoiceExtraction = Omit<Nullify<Raw>, 'payment'> & {
  payment: Omit<Nullify<Raw['payment']>, 'method' | 'status'> & {
    status: Raw['payment']['status'];
    method: Exclude<Raw['payment']['method'], 'unknown'> | null;
  };
};

const blank = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim();
  return t ? t : null;
};

/** "" → null throughout; dates kept only when they are real YYYY-MM-DD dates. */
export function normalizeExtraction(raw: Raw): InvoiceExtraction {
  const date = (s: string) => {
    const t = blank(s);
    return t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t)) ? t : null;
  };
  return {
    ...raw,
    vendor: {
      name: blank(raw.vendor.name),
      name_latin: blank(raw.vendor.name_latin),
      tax_id: blank(raw.vendor.tax_id),
      email: blank(raw.vendor.email)?.toLowerCase() ?? null,
      website: blank(raw.vendor.website),
      country: blank(raw.vendor.country),
    },
    bill_to: { name: blank(raw.bill_to.name), country: blank(raw.bill_to.country) },
    invoice_number: blank(raw.invoice_number),
    invoice_date: date(raw.invoice_date),
    due_date: date(raw.due_date),
    currency: blank(raw.currency)?.toUpperCase() ?? null,
    service_period: { from: date(raw.service_period.from), to: date(raw.service_period.to) },
    payment: {
      status: raw.payment.status,
      method: raw.payment.method === 'unknown' ? null : raw.payment.method,
      card_brand: blank(raw.payment.card_brand),
      card_last4: /^\d{4}$/.test(blank(raw.payment.card_last4) ?? '') ? blank(raw.payment.card_last4) : null,
      paid_date: date(raw.payment.paid_date),
    },
    language: blank(raw.language),
  };
}
