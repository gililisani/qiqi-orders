/**
 * Invoice reader on the Anthropic API: the PDF (or image) goes in, the
 * structured InvoiceExtraction comes out (structured output — schema-valid
 * by construction). Server only; the key lives in ANTHROPIC_API_KEY.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { normalizeExtraction, ReaderOutputSchema } from './schema';
import type { InvoiceReader, ReadInput, ReadResult } from './index';

const MODEL = process.env.AP_READER_MODEL || 'claude-opus-5-5';

const INSTRUCTIONS = `You read vendor invoices for an accounts-payable team and extract them exactly as printed.

Rules:
- Never guess. A text field that is not on the document is an empty string; a missing amount is null.
- Dates as YYYY-MM-DD. Read the document's own date format carefully (European and Israeli documents put the day first).
- Amounts as plain numbers in the invoice's currency, without symbols or thousands separators. Credit notes keep positive amounts; document_type says it is a credit note.
- currency is the ISO 4217 code of the amounts charged (USD, ILS, EUR, GBP…).
- lines: the billed items with their amounts before tax. tax_lines: each tax / VAT shown separately.
- payment.status is "paid" only when the document shows the charge was made (a receipt, "Paid", "Amount due 0.00", "charged to your card…"); "unpaid" when it asks for payment or shows an amount due; otherwise "unknown". card_last4 only when the digits are printed.
- service_period: the period the charges cover, when shown (subscriptions usually show it).
- is_invoice is false for statements, quotes, order confirmations, shipping notices, newsletters and anything that is not a bill or a receipt.
- warnings: short notes for the bookkeeper about anything unclear, cut off, unreadable, or not adding up.`;

export function createClaudeReader(client: Anthropic = new Anthropic()): InvoiceReader {
  return {
    name: MODEL,
    async read(input: ReadInput): Promise<ReadResult> {
      const data = Buffer.from(input.bytes).toString('base64');
      const file: Anthropic.Beta.BetaContentBlockParam =
        input.mime === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
          : { type: 'image', source: { type: 'base64', media_type: input.mime, data } };
      const context = input.emailContext
        ? `\n\nIt arrived by email — from: ${input.emailContext.from ?? 'unknown'}; subject: ${input.emailContext.subject ?? ''}.`
        : '';

      const response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: INSTRUCTIONS,
        output_config: { effort: 'medium', format: betaZodOutputFormat(ReaderOutputSchema) },
        messages: [
          {
            role: 'user',
            content: [file, { type: 'text', text: `Extract this document.${context}` }],
          },
        ],
      });

      if (response.stop_reason === 'refusal') {
        throw new Error('The reader declined to read this document.');
      }
      if (response.stop_reason === 'max_tokens') {
        throw new Error('The document was too long to read in one pass.');
      }
      if (!response.parsed_output) {
        throw new Error('The reader returned no usable result.');
      }
      return {
        extraction: normalizeExtraction(response.parsed_output),
        reader: response.model,
        usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
      };
    },
  };
}
