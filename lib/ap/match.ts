/**
 * Which vendor sent this invoice (docs/AP-AUTOMATION.md §2.3). Pure: scores
 * the learned vendor profiles against what was read and who sent it.
 * A confident match is proposed; anything less is left for a person to pick.
 */
import type { InvoiceExtraction } from './reader/schema';

export interface MatchableProfile {
  ns_vendor_id: string;
  vendor_name: string;
  aliases: string[];
  memo_label: string | null;
  sender_emails: string[];
}

export interface VendorMatch {
  ns_vendor_id: string;
  vendor_name: string;
  score: number;
  reason: string;
}

/** Free-mail and platform domains say nothing about who the vendor is. */
const GENERIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com',
  'me.com', 'aol.com', 'protonmail.com', 'proton.me', 'walla.co.il', 'zahav.net.il', 'bezeqint.net',
  'stripe.com', 'paypal.com', 'squareup.com', 'intuit.com', 'quickbooks.com', 'bill.com', 'xero.com',
]);

const LEGAL_SUFFIXES = new Set([
  'inc', 'llc', 'ltd', 'limited', 'pte', 'gmbh', 'bv', 'b v', 'sa', 'sas', 'srl', 'co', 'corp', 'corporation',
  'company', 'pbc', 'plc', 'as', 'ab', 'oy', 'ag', 'nv', 'kft', 'sro', 'בעמ', 'בע"מ', 'the',
]);

/** "Supabase Pte. Ltd" → "supabase"; "Vercel Inc" → "vercel". */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/["'’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w && !LEGAL_SUFFIXES.has(w) && !/^v\d{3,}$/.test(w)) // drop NetSuite codes like "V5312"
    .join(' ')
    .trim();
}

const tokens = (s: string) => new Set(s.split(' ').filter((t) => t.length > 1));

/** Domain of an email or website: "billing@mail.supabase.io" → "supabase.io". */
export function baseDomain(s: string | null | undefined): string | null {
  const host = (s ?? '').toLowerCase().trim().replace(/^.*@/, '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
  if (!host || !host.includes('.')) return null;
  const parts = host.split('.');
  // Keep 3 labels for 2-letter second-level domains (co.il, co.uk, com.au).
  const keep = parts.length >= 3 && /^(co|com|org|net|ac|gov)$/.test(parts[parts.length - 2]) ? 3 : 2;
  return parts.slice(-keep).join('.');
}

function nameScore(read: string, candidate: string): number {
  if (!read || !candidate) return 0;
  if (read === candidate) return 90;
  const a = tokens(read);
  const b = tokens(candidate);
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((t) => b.has(t)).length;
  const jaccard = shared / new Set([...a, ...b]).size;
  if (jaccard >= 0.6) return Math.round(60 + jaccard * 25);
  // "Klaviyo" vs "Klaviyo Marketing": one name fully inside the other.
  const [short, long] = read.length <= candidate.length ? [read, candidate] : [candidate, read];
  if (short.length >= 4 && (` ${long} `).includes(` ${short} `)) return 75;
  return 0;
}

export function rankVendors(
  extraction: Pick<InvoiceExtraction, 'vendor'>,
  emailFrom: string | null,
  profiles: MatchableProfile[],
): VendorMatch[] {
  const readNames = [extraction.vendor.name, extraction.vendor.name_latin].map(normalizeName).filter(Boolean);
  const sender = (emailFrom ?? '').toLowerCase().trim() || null;
  const domains = [sender, extraction.vendor.email, extraction.vendor.website]
    .map(baseDomain)
    .filter((d): d is string => !!d && !GENERIC_DOMAINS.has(d));

  const out: VendorMatch[] = [];
  for (const p of profiles) {
    let best = 0;
    let reason = '';
    const bump = (score: number, why: string) => {
      if (score > best) [best, reason] = [score, why];
    };
    const senders = p.sender_emails.map((e) => e.toLowerCase());
    if (sender && senders.includes(sender)) bump(100, `sent from ${sender}, a known address of this vendor`);
    if (extraction.vendor.email && senders.includes(extraction.vendor.email)) bump(95, `invoice shows ${extraction.vendor.email}`);
    const profileDomains = new Set(senders.map(baseDomain).filter((d): d is string => !!d && !GENERIC_DOMAINS.has(d)));
    const sharedDomain = domains.find((d) => profileDomains.has(d));
    if (sharedDomain) bump(85, `same email domain (${sharedDomain})`);
    for (const candidate of [p.vendor_name, p.memo_label, ...p.aliases].map(normalizeName)) {
      for (const read of readNames) {
        const s = nameScore(read, candidate);
        if (s) bump(s, s >= 90 ? 'same vendor name' : 'similar vendor name');
      }
    }
    if (best > 0) out.push({ ns_vendor_id: p.ns_vendor_id, vendor_name: p.vendor_name, score: best, reason });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The vendor to propose: confident (≥ 75) and clearly ahead of the next one. */
export function pickVendor(ranked: VendorMatch[]): VendorMatch | null {
  const [top, next] = ranked;
  if (!top || top.score < 75) return null;
  if (next && top.score - next.score < 10 && next.ns_vendor_id !== top.ns_vendor_id) return null;
  return top;
}
