/**
 * AP data access shared by the API routes (server only, service role).
 */
import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export const AP_BUCKET = 'ap-documents';
/** Invoices are small; this also bounds what the reader is ever sent. */
export const AP_MAX_BYTES = 20 * 1024 * 1024;

export type ApDocumentStatus =
  | 'received' | 'reading' | 'needs_review' | 'posting' | 'posted'
  | 'rejected' | 'not_invoice' | 'unpaid' | 'duplicate' | 'error';

export interface ApSettings {
  ns_target: 'sandbox' | 'production';
  mailbox: string | null;
  approver_ids: string[];
  payment_accounts: Array<{
    ns_account_id: string;
    name: string;
    type: 'card' | 'bank';
    last4: string | null;
    currency: string | null;
    uses: number;
  }>;
  learned_at: string | null;
  learn_summary: Record<string, unknown> | null;
}

export async function getApSettings(db: SupabaseClient): Promise<ApSettings> {
  const { data, error } = await db.from('ap_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error(`ap_settings read failed: ${error.message}`);
  if (!data) throw new Error('ap_settings row missing — run migration 20261024120000_ap_automation.sql');
  return data as ApSettings;
}

export async function apEvent(
  db: SupabaseClient,
  documentId: string | null,
  event: string,
  detail: Record<string, unknown> | null = null,
  actor: string | null = null,
): Promise<void> {
  await db.from('ap_events').insert({ document_id: documentId, event, detail, actor });
}

/** What kind of file the bytes really are (never trust the name or the browser). */
export function sniffMime(bytes: Uint8Array): 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const b = bytes;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf'; // %PDF
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

export const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Strip path separators and control characters from a file name. */
export function safeFileName(input: string): string {
  const s = String(input ?? '')
    .replace(/[\\/]/g, '_')
    .replace(/\.\.+/g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .slice(0, 150);
  return s || 'invoice';
}
