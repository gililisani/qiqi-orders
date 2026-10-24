/**
 * The invoice reader is swappable (docs/AP-AUTOMATION.md §2.2): today the
 * Anthropic API; a learned per-vendor layout reader or another provider can
 * sit behind the same interface.
 */
import type { InvoiceExtraction } from './schema';

export type ReaderMime = 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp';

export interface ReadInput {
  bytes: Uint8Array;
  mime: ReaderMime;
  emailContext?: { from: string | null; subject: string | null };
}

export interface ReadResult {
  extraction: InvoiceExtraction;
  /** Which reader/model produced it. */
  reader: string;
  usage: { input_tokens: number; output_tokens: number } | null;
}

export interface InvoiceReader {
  name: string;
  read(input: ReadInput): Promise<ReadResult>;
}

/** The reader for this environment, or null when none is configured. */
export async function createInvoiceReader(): Promise<InvoiceReader | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const { createClaudeReader } = await import('./claude');
  return createClaudeReader();
}
