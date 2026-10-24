/**
 * AP mailbox intake (docs/AP-AUTOMATION.md §2.1): reads the AP mailbox through
 * Microsoft Graph — read-only, and Exchange limits the app to that one
 * mailbox — and turns each email into AP documents: every invoice attachment
 * (PDF or image), or the email text itself when it carries none.
 *
 * Graph's delta query remembers where the last run stopped, so each email is
 * fetched once; an email already in the inbox is skipped, and the same file
 * arriving twice is stored once (fingerprint). Credentials: AP_MAIL_* when
 * set (lets staging read the mailbox without being able to send email),
 * otherwise the Hub's AZURE_* app.
 */
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AP_BUCKET, AP_MAX_BYTES, apEvent, getApSettings, safeFileName, sha256, sniffMime } from './store';
import { processDocument, type ProcessDeps } from './process';

const GRAPH = 'https://graph.microsoft.com/v1.0';
/** Images smaller than this are signature logos, not invoices. */
const MIN_IMAGE_BYTES = 30_000;
/** Email text shorter than this is not a receipt ("see attached"). */
const MIN_BODY_CHARS = 200;

// --- pure helpers -----------------------------------------------------------

/** SPF / DKIM / DMARC verdicts from the Authentication-Results header. */
export function parseAuthResults(headers: Array<{ name: string; value: string }> | null | undefined) {
  const h = (headers ?? []).find((x) => x.name.toLowerCase() === 'authentication-results')?.value ?? '';
  const verdict = (key: string) => (new RegExp(`\\b${key}=(\\w+)`, 'i').exec(h)?.[1] ?? null)?.toLowerCase() ?? null;
  return { spf: verdict('spf'), dkim: verdict('dkim'), dmarc: verdict('dmarc') };
}

/** Readable text from an HTML email body. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string | null;
  size: number;
  isInline: boolean;
  '@odata.type'?: string;
}

/** Attachments worth reading: files (not embedded emails), not inline logos, not tiny images. */
export function invoiceAttachments(list: GraphAttachment[]): GraphAttachment[] {
  return list.filter((a) => {
    if (a['@odata.type'] && a['@odata.type'] !== '#microsoft.graph.fileAttachment') return false;
    if (a.size > AP_MAX_BYTES) return false;
    const pdf = /pdf/i.test(a.contentType ?? '') || /\.pdf$/i.test(a.name);
    const image = /^image\/(png|jpe?g|webp)/i.test(a.contentType ?? '') || /\.(png|jpe?g|webp)$/i.test(a.name);
    if (pdf) return true;
    return image && !a.isInline && a.size >= MIN_IMAGE_BYTES;
  });
}

// --- Graph -------------------------------------------------------------------

let cached: { token: string; expiresAt: number } | null = null;

export function apMailConfigured(): boolean {
  const v = (k: string) => (process.env[`AP_MAIL_${k}`] ?? process.env[`AZURE_${k}`])?.trim();
  return !!(v('TENANT_ID') && v('CLIENT_ID') && v('CLIENT_SECRET'));
}

async function graphToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const v = (k: string) => (process.env[`AP_MAIL_${k}`] ?? process.env[`AZURE_${k}`])?.trim() ?? '';
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(v('TENANT_ID'))}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: v('CLIENT_ID'),
      client_secret: v('CLIENT_SECRET'),
      scope: 'https://graph.microsoft.com/.default',
    }).toString(),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`Microsoft sign-in failed: ${json.error ?? res.status}`);
  cached = { token: json.access_token, expiresAt: Date.now() + Number(json.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function graph<T>(url: string, raw = false): Promise<T> {
  const token = await graphToken();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url.startsWith('http') ? url : `${GRAPH}${url}`, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'odata.maxpagesize=25' },
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') ?? 2) * 1000));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Microsoft Graph ${res.status}: ${body.slice(0, 200)}`);
    }
    return (raw ? new Uint8Array(await res.arrayBuffer()) : await res.json()) as T;
  }
}

// --- intake ------------------------------------------------------------------

interface GraphMessage {
  id: string;
  internetMessageId?: string;
  subject?: string;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  from?: { emailAddress?: { address?: string } };
  '@removed'?: unknown;
}

export interface MailboxRunResult {
  skipped?: string;
  emails: number;
  documents: number;
  read: number;
  errors: string[];
}

/** Store one file as an AP document from an email (skipped when the same file is already stored). */
async function storeDocument(
  db: SupabaseClient,
  msg: GraphMessage & { email_auth: Record<string, string | null> },
  key: string,
  name: string,
  bytes: Uint8Array,
  mime: string,
): Promise<string | null> {
  const hash = sha256(bytes);
  const { data: same } = await db.from('ap_documents').select('id').eq('sha256', hash).maybeSingle();
  if (same) return null;
  const fileName = safeFileName(name);
  const path = `email/${new Date().toISOString().slice(0, 7)}/${randomUUID()}/${fileName}`;
  const { error: upErr } = await db.storage.from(AP_BUCKET).upload(path, bytes, { contentType: mime });
  if (upErr) throw new Error(`Storing ${fileName} failed: ${upErr.message}`);
  const { data: doc, error } = await db
    .from('ap_documents')
    .insert({
      source: 'email',
      email_message_id: key,
      email_from: msg.from?.emailAddress?.address?.toLowerCase() ?? null,
      email_subject: msg.subject ?? null,
      email_received_at: msg.receivedDateTime ?? null,
      email_auth: msg.email_auth,
      file_name: fileName,
      mime_type: mime,
      storage_path: path,
      sha256: hash,
      bytes: bytes.byteLength,
      status: 'received',
    })
    .select('id')
    .single();
  if (error) {
    await db.storage.from(AP_BUCKET).remove([path]);
    if (/duplicate key/i.test(error.message)) return null; // a parallel run stored it first
    throw new Error(error.message);
  }
  await apEvent(db, doc.id, 'received', { from: msg.from?.emailAddress?.address ?? null, subject: msg.subject ?? null });
  return doc.id;
}

/** Turn one email into AP documents. Returns their ids. */
async function intakeMessage(db: SupabaseClient, mailbox: string, m: GraphMessage): Promise<string[]> {
  const key = m.internetMessageId || m.id;
  const { data: seen } = await db.from('ap_documents').select('id').eq('email_message_id', key).limit(1);
  if (seen?.length) return [];

  const base = `/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(m.id)}`;
  const full = await graph<GraphMessage & { body?: { contentType: string; content: string }; internetMessageHeaders?: Array<{ name: string; value: string }> }>(
    `${base}?$select=id,internetMessageId,subject,from,receivedDateTime,hasAttachments,body,internetMessageHeaders`,
  );
  const msg = { ...full, email_auth: parseAuthResults(full.internetMessageHeaders) };
  const ids: string[] = [];
  let candidates: GraphAttachment[] = [];

  if (full.hasAttachments) {
    const { value } = await graph<{ value: GraphAttachment[] }>(`${base}/attachments?$select=id,name,contentType,size,isInline`);
    candidates = invoiceAttachments(value);
    for (const a of candidates) {
      const bytes = await graph<Uint8Array>(`${base}/attachments/${encodeURIComponent(a.id)}/$value`, true);
      const mime = sniffMime(bytes);
      if (!mime) continue; // named .pdf but isn't one
      const id = await storeDocument(db, msg, key, a.name, bytes, mime);
      if (id) ids.push(id);
    }
  }
  if (!candidates.length) {
    // No invoice attachment: the email text may itself be the receipt.
    // (Attachments that were all already stored don't fall back to the text.)
    const content = full.body?.content ?? '';
    const text = full.body?.contentType?.toLowerCase() === 'html' ? htmlToText(content) : content.trim();
    if (text.length >= MIN_BODY_CHARS) {
      const header = `From: ${full.from?.emailAddress?.address ?? ''}\nSubject: ${full.subject ?? ''}\nDate: ${full.receivedDateTime ?? ''}\n\n`;
      const name = `${(full.subject || 'email').replace(/[^\p{L}\p{N} ._-]+/gu, ' ').trim().slice(0, 80) || 'email'}.txt`;
      const id = await storeDocument(db, msg, key, name, new TextEncoder().encode(header + text.slice(0, 50_000)), 'text/plain');
      if (id) ids.push(id);
    }
  }
  return ids;
}

/**
 * One mailbox run: fetch new emails, store their documents, read them. Also
 * picks up any document still waiting to be read (e.g. an upload whose
 * after-upload read was cut short). Bounded by `budgetMs`; whatever is left
 * waits for the next run.
 */
export async function checkMailbox(
  db: SupabaseClient,
  deps: ProcessDeps,
  opts: { budgetMs?: number; now?: () => number } = {},
): Promise<MailboxRunResult> {
  const now = opts.now ?? Date.now;
  const started = now();
  const budget = opts.budgetMs ?? 240_000;
  const result: MailboxRunResult = { emails: 0, documents: 0, read: 0, errors: [] };
  const settings = await getApSettings(db);
  const mailbox = settings.mailbox;
  if (!mailbox) return { ...result, skipped: 'No AP mailbox set.' };
  if (!apMailConfigured()) return { ...result, skipped: 'Mailbox access is not set up on this environment.' };

  // One run at a time.
  const lockUntil = new Date(started + budget + 60_000).toISOString();
  const { data: locked } = await db
    .from('ap_settings')
    .update({ mailbox_lock_until: lockUntil })
    .eq('id', 1)
    .or(`mailbox_lock_until.is.null,mailbox_lock_until.lt.${new Date(started).toISOString()}`)
    .select('mailbox_delta_link')
    .maybeSingle();
  if (!locked) return { ...result, skipped: 'Another mailbox run is in progress.' };

  let deltaLink: string | null = locked.mailbox_delta_link;
  try {
    let url =
      deltaLink ??
      `/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages/delta?$select=id,internetMessageId,subject,from,receivedDateTime,hasAttachments`;
    const fresh: string[] = [];
    for (;;) {
      const page = await graph<{ value: GraphMessage[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string }>(url);
      for (const m of page.value) {
        if (m['@removed']) continue;
        try {
          const ids = await intakeMessage(db, mailbox, m);
          if (ids.length) result.emails += 1;
          result.documents += ids.length;
          fresh.push(...ids);
        } catch (err: any) {
          result.errors.push(`${m.subject ?? m.id}: ${String(err?.message ?? err).slice(0, 200)}`);
        }
      }
      if (page['@odata.nextLink']) {
        url = page['@odata.nextLink'];
        if (now() - started > budget / 2) break; // finish next run; the delta link isn't advanced
        continue;
      }
      deltaLink = page['@odata.deltaLink'] ?? deltaLink;
      break;
    }

    // Read what arrived, then anything else still waiting (oldest first).
    const { data: waiting } = await db
      .from('ap_documents')
      .select('id')
      .eq('status', 'received')
      .lt('created_at', new Date(started - 60_000).toISOString())
      .order('created_at')
      .limit(20);
    const queue = [...new Set([...fresh, ...(waiting ?? []).map((w) => w.id)])];
    for (const id of queue) {
      if (now() - started > budget) break;
      const r = await processDocument(db, id, deps);
      if (r.status !== 'received') result.read += 1;
    }

    await db
      .from('ap_settings')
      .update({
        mailbox_delta_link: deltaLink,
        mailbox_checked_at: new Date(now()).toISOString(),
        mailbox_error: result.errors[0] ?? null,
        mailbox_lock_until: null,
      })
      .eq('id', 1);
    if (result.documents || result.errors.length) await apEvent(db, null, 'mailbox_checked', { ...result });
    return result;
  } catch (err: any) {
    const message = String(err?.message ?? err).slice(0, 300);
    await db
      .from('ap_settings')
      .update({ mailbox_checked_at: new Date(now()).toISOString(), mailbox_error: message, mailbox_lock_until: null })
      .eq('id', 1);
    return { ...result, errors: [...result.errors, message] };
  }
}
