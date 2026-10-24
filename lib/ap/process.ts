/**
 * Process one AP document (docs/AP-AUTOMATION.md §2), in two steps:
 *  1. read — the file is read once (processDocument);
 *  2. evaluate — vendor match, invoice + receipt pairing, the proposed bill
 *     and its checks (evaluateDocument). Re-runnable at any time: when a
 *     receipt for it arrives, after re-learning, after a reviewer's edit.
 * Read-only towards NetSuite — posting is a separate, approved step. A
 * document is claimed atomically, so two runs never read the same file.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NetSuiteAPI } from '../netsuite';
import { AP_BUCKET, apEvent, getApSettings } from './store';
import type { InvoiceReader, ReaderMime } from './reader';
import type { InvoiceExtraction } from './reader/schema';
import { pickVendor, rankVendors, normalizeName, type MatchableProfile } from './match';
import { buildProposal, runChecks, type NetSuiteFacts, type ProposalProfile } from './propose';

export interface ProcessDeps {
  reader: InvoiceReader | null;
  /** NetSuite the module posts to — for "already booked?" and vendor lookups. */
  ns: Pick<NetSuiteAPI, 'suiteQL'> | null;
}

type Doc = {
  id: string;
  status: string;
  source: 'email' | 'upload';
  email_message_id: string | null;
  email_from: string | null;
  email_subject: string | null;
  file_name: string | null;
  mime_type: string | null;
  storage_path: string | null;
  extraction: InvoiceExtraction | null;
  ns_vendor_id: string | null;
  invoice_number: string | null;
  total: number | null;
  primary_document_id: string | null;
  created_at: string;
};

/** States in which a document's proposal may still be (re)computed. */
const OPEN = ['reading', 'needs_review', 'unpaid', 'duplicate', 'attached', 'error'];

const esc = (s: string) => s.replace(/'/g, "''");
const sameMoney = (a: number | null, b: number | null) => a !== null && b !== null && Math.abs(Number(a) - Number(b)) < 0.01;

/** NetSuite vendors whose name looks like the invoice's — offered when no learned profile matches. */
async function searchNetSuiteVendors(ns: Pick<NetSuiteAPI, 'suiteQL'>, x: InvoiceExtraction) {
  const words = normalizeName(x.vendor.name_latin ?? x.vendor.name)
    .split(' ')
    .filter((w) => w.length >= 3)
    .slice(0, 2);
  if (!words.length) return [];
  const where = words.map((w) => `LOWER(companyname) LIKE '%${esc(w)}%'`).join(' OR ');
  const rows = await ns.suiteQL<{ id: string; entityid: string; companyname: string | null }>(
    `SELECT id, entityid, companyname FROM vendor WHERE isinactive = 'F' AND (${where}) FETCH FIRST 10 ROWS ONLY`,
  );
  return rows.map((r) => ({ ns_vendor_id: String(r.id), vendor_name: r.companyname || r.entityid }));
}

/**
 * The invoice wins over its receipt; between equals, the first to arrive.
 * Every document of a pair computes the same answer.
 */
export function choosePrimary<T extends { id: string; created_at: string; extraction: InvoiceExtraction | null }>(docs: T[]): T {
  const rank = (d: T) => (d.extraction?.document_type === 'invoice' ? 0 : d.extraction?.document_type === 'receipt' ? 1 : 2);
  return [...docs].sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0];
}

/** The invoice's payment, completed from an attached receipt that shows the charge. */
export function mergePayment(primary: InvoiceExtraction, attached: InvoiceExtraction[]): { payment: InvoiceExtraction['payment']; fromReceipt: boolean } {
  const own = primary.payment;
  if (own.status === 'paid' && own.card_last4) return { payment: own, fromReceipt: false };
  const paid = attached.find((x) => x.payment.status === 'paid');
  if (!paid) return { payment: own, fromReceipt: false };
  return {
    payment: {
      status: 'paid',
      method: own.method ?? paid.payment.method,
      card_brand: own.card_brand ?? paid.payment.card_brand,
      card_last4: own.card_last4 ?? paid.payment.card_last4,
      paid_date: own.paid_date ?? paid.payment.paid_date,
    },
    fromReceipt: true,
  };
}

/** Other read documents that are the same charge: same email or same vendor + invoice number, same amount. */
async function findSiblings(db: SupabaseClient, doc: Doc, vendorId: string | null): Promise<Doc[]> {
  const x = doc.extraction!;
  const found = new Map<string, Doc>();
  const consider = (rows: Doc[] | null) => {
    for (const r of rows ?? []) if (r.id !== doc.id && r.extraction && sameMoney(r.extraction.total, x.total)) found.set(r.id, r);
  };
  if (doc.email_message_id) {
    const { data } = await db.from('ap_documents').select('*').eq('email_message_id', doc.email_message_id).in('status', OPEN);
    consider((data ?? []).filter((r: Doc) => !x.invoice_number || !r.invoice_number || r.invoice_number.toLowerCase() === x.invoice_number.toLowerCase()) as Doc[]);
  }
  if (vendorId && x.invoice_number) {
    const { data } = await db
      .from('ap_documents')
      .select('*')
      .eq('ns_vendor_id', vendorId)
      .ilike('invoice_number', x.invoice_number.replace(/[%_\\]/g, (m) => `\\${m}`))
      .in('status', OPEN);
    consider(data as Doc[]);
  }
  return [...found.values()];
}

export async function processDocument(db: SupabaseClient, id: string, deps: ProcessDeps): Promise<{ status: string }> {
  // Claim it: only a waiting (or failed) document is picked up.
  const { data: claimed } = await db
    .from('ap_documents')
    .update({ status: 'reading', error: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .in('status', ['received', 'error'])
    .select('*')
    .maybeSingle();
  if (!claimed) {
    const { data: doc } = await db.from('ap_documents').select('status').eq('id', id).maybeSingle();
    return { status: doc?.status ?? 'missing' };
  }

  try {
    if (!deps.reader) return await failDocument(db, id, 'Invoice reading is not set up on this environment.');
    const { data: blob, error: dlErr } = await db.storage.from(AP_BUCKET).download(claimed.storage_path);
    if (dlErr || !blob) return await failDocument(db, id, 'The stored file could not be opened.');
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const read = await deps.reader.read({
      bytes,
      mime: claimed.mime_type as ReaderMime,
      emailContext: claimed.source === 'email' ? { from: claimed.email_from, subject: claimed.email_subject } : undefined,
    });
    const x = read.extraction;
    const now = new Date().toISOString();
    await apEvent(db, id, 'read', { reader: read.reader, usage: read.usage, is_invoice: x.is_invoice, document_type: x.document_type });
    await db
      .from('ap_documents')
      .update({
        extraction: x,
        reader: read.reader,
        read_at: now,
        invoice_number: x.invoice_number,
        invoice_date: x.invoice_date,
        total: x.total,
        currency: x.currency,
        status: x.is_invoice ? 'reading' : 'not_invoice',
        updated_at: now,
      })
      .eq('id', id);
    if (!x.is_invoice) return { status: 'not_invoice' };
    return await evaluateDocument(db, id, deps);
  } catch (err: any) {
    return await failDocument(db, id, String(err?.message ?? err));
  }
}

async function failDocument(db: SupabaseClient, id: string, message: string) {
  await db.from('ap_documents').update({ status: 'error', error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', id);
  await apEvent(db, id, 'error', { message: message.slice(0, 500) });
  return { status: 'error' };
}

export async function evaluateDocument(db: SupabaseClient, id: string, deps: ProcessDeps, depth = 0): Promise<{ status: string }> {
  const { data: row } = await db.from('ap_documents').select('*').eq('id', id).maybeSingle();
  const doc = row as Doc | null;
  if (!doc) return { status: 'missing' };
  if (!doc.extraction || !OPEN.includes(doc.status)) return { status: doc.status };
  const x = doc.extraction;

  try {
    // Vendor.
    const settings = await getApSettings(db);
    const { data: profileRows } = await db.from('ap_vendor_profiles').select('*').limit(5000);
    const profiles = (profileRows ?? []) as Array<MatchableProfile & ProposalProfile & { subsidiary_name: string | null }>;
    const ranked = rankVendors(x, doc.email_from, profiles);
    const picked = pickVendor(ranked);
    const profile = picked ? profiles.find((p) => p.ns_vendor_id === picked.ns_vendor_id) ?? null : null;

    // Invoice + receipt for the same charge → one bill.
    const siblings = await findSiblings(db, doc, profile?.ns_vendor_id ?? null);
    const primary = choosePrimary([doc, ...siblings]);
    const now = new Date().toISOString();
    if (primary.id !== doc.id) {
      await db
        .from('ap_documents')
        .update({ status: 'attached', primary_document_id: primary.id, ns_vendor_id: profile?.ns_vendor_id ?? null, proposal: null, checks: null, updated_at: now })
        .eq('id', doc.id);
      await apEvent(db, doc.id, 'attached', { to: primary.id, document_type: x.document_type });
      if (depth === 0) await evaluateDocument(db, primary.id, deps, 1);
      return { status: 'attached' };
    }
    const attached = siblings;
    for (const s of attached) {
      if (s.status !== 'attached' || s.primary_document_id !== doc.id) {
        await db.from('ap_documents').update({ status: 'attached', primary_document_id: doc.id, proposal: null, checks: null, updated_at: now }).eq('id', s.id);
        await apEvent(db, s.id, 'attached', { to: doc.id, document_type: s.extraction?.document_type ?? null });
      }
    }
    const merged = mergePayment(x, attached.map((s) => s.extraction!));
    const effective: InvoiceExtraction = { ...x, payment: merged.payment };

    const nsCandidates = !picked && deps.ns ? await searchNetSuiteVendors(deps.ns, x).catch(() => []) : [];
    const proposal = buildProposal(effective, profile, settings.payment_accounts);
    const facts: NetSuiteFacts = {};
    if (deps.ns && proposal.ns_vendor_id && x.invoice_number) {
      const rows = await deps.ns.suiteQL<{ id: string; tranid: string }>(
        `SELECT id, tranid FROM transaction WHERE type = 'VendBill' AND entity = ${Number(proposal.ns_vendor_id)} AND UPPER(tranid) = UPPER('${esc(x.invoice_number)}')`,
      );
      facts.existingBill = rows[0] ? { id: String(rows[0].id), tranid: rows[0].tranid } : null;
    }
    if (!facts.existingBill && proposal.ns_vendor_id && x.invoice_number) {
      const { data: posted } = await db
        .from('ap_documents')
        .select('id, ns_bill_id')
        .eq('status', 'posted')
        .eq('ns_vendor_id', proposal.ns_vendor_id)
        .ilike('invoice_number', x.invoice_number.replace(/[%_\\]/g, (m) => `\\${m}`))
        .neq('id', id)
        .limit(1);
      if (posted?.[0]) facts.existingBill = { id: posted[0].ns_bill_id ?? posted[0].id, tranid: x.invoice_number };
    }
    const orgNames = [...new Set(profiles.map((p) => p.subsidiary_name).filter((n): n is string => !!n))];
    const checks = runChecks(effective, proposal, profile, facts, orgNames);
    if (merged.fromReceipt) checks.unshift({ code: 'receipt', level: 'ok', message: 'Payment details from the attached receipt.' });

    const status = facts.existingBill
      ? 'duplicate'
      : effective.payment.status === 'unpaid' || effective.payment.status === 'partially_paid'
        ? 'unpaid'
        : 'needs_review';
    await db
      .from('ap_documents')
      .update({
        status,
        error: null,
        ns_vendor_id: proposal.ns_vendor_id,
        proposal: {
          ...proposal,
          vendor_candidates: ranked.slice(0, 5),
          ns_vendor_candidates: nsCandidates,
          attachments: attached.map((s) => ({ id: s.id, file_name: s.file_name, document_type: s.extraction?.document_type ?? null })),
        },
        checks,
        ns_target: settings.ns_target,
        updated_at: now,
      })
      .eq('id', id);
    await apEvent(db, id, 'proposed', {
      status,
      vendor: picked ? { id: picked.ns_vendor_id, score: picked.score, reason: picked.reason } : null,
      attachments: attached.length,
      blocks: checks.filter((c) => c.level === 'block').map((c) => c.code),
    });
    return { status };
  } catch (err: any) {
    return await failDocument(db, id, String(err?.message ?? err));
  }
}
