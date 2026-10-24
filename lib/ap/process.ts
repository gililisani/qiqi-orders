/**
 * Process one AP document: read it, match the vendor, propose the bill, run
 * the checks (docs/AP-AUTOMATION.md §2). Read-only towards NetSuite — posting
 * is a separate, human-approved step. Safe to run twice: a document is
 * claimed atomically, so two runs never read the same file at once.
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

const esc = (s: string) => s.replace(/'/g, "''");

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

  const fail = async (message: string) => {
    await db.from('ap_documents').update({ status: 'error', error: message.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', id);
    await apEvent(db, id, 'error', { message: message.slice(0, 500) });
    return { status: 'error' };
  };

  try {
    if (!deps.reader) return await fail('Invoice reading is not set up on this environment.');
    const { data: blob, error: dlErr } = await db.storage.from(AP_BUCKET).download(claimed.storage_path);
    if (dlErr || !blob) return await fail('The stored file could not be opened.');
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const read = await deps.reader.read({
      bytes,
      mime: claimed.mime_type as ReaderMime,
      emailContext: claimed.source === 'email' ? { from: claimed.email_from, subject: claimed.email_subject } : undefined,
    });
    const x = read.extraction;
    const now = new Date().toISOString();
    await apEvent(db, id, 'read', { reader: read.reader, usage: read.usage, is_invoice: x.is_invoice, document_type: x.document_type });

    const base = {
      extraction: x,
      reader: read.reader,
      read_at: now,
      invoice_number: x.invoice_number,
      invoice_date: x.invoice_date,
      total: x.total,
      currency: x.currency,
      updated_at: now,
    };
    if (!x.is_invoice) {
      await db.from('ap_documents').update({ ...base, status: 'not_invoice' }).eq('id', id);
      return { status: 'not_invoice' };
    }

    // Vendor.
    const settings = await getApSettings(db);
    const { data: profileRows } = await db.from('ap_vendor_profiles').select('*').limit(5000);
    const profiles = (profileRows ?? []) as Array<MatchableProfile & ProposalProfile & { subsidiary_name: string | null }>;
    const ranked = rankVendors(x, claimed.email_from, profiles);
    const picked = pickVendor(ranked);
    const profile = picked ? profiles.find((p) => p.ns_vendor_id === picked.ns_vendor_id) ?? null : null;
    const nsCandidates = !picked && deps.ns ? await searchNetSuiteVendors(deps.ns, x).catch(() => []) : [];

    // Proposal + checks.
    const proposal = buildProposal(x, profile, settings.payment_accounts);
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
    const checks = runChecks(x, proposal, profile, facts, orgNames);

    const status = facts.existingBill
      ? 'duplicate'
      : x.payment.status === 'unpaid' || x.payment.status === 'partially_paid'
        ? 'unpaid'
        : 'needs_review';
    await db
      .from('ap_documents')
      .update({
        ...base,
        status,
        ns_vendor_id: proposal.ns_vendor_id,
        proposal: { ...proposal, vendor_candidates: ranked.slice(0, 5), ns_vendor_candidates: nsCandidates },
        checks,
        ns_target: settings.ns_target,
      })
      .eq('id', id);
    await apEvent(db, id, 'proposed', {
      status,
      vendor: picked ? { id: picked.ns_vendor_id, score: picked.score, reason: picked.reason } : null,
      blocks: checks.filter((c) => c.level === 'block').map((c) => c.code),
    });
    return { status };
  } catch (err: any) {
    return await fail(String(err?.message ?? err));
  }
}
