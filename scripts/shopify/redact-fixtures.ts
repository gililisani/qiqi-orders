/**
 * Produce committable test fixtures from the raw captures: PII redacted
 * deterministically (same input → same pseudonym, so matching logic stays
 * testable), all ids/money/structure preserved.
 *
 *   npx tsx scripts/shopify/redact-fixtures.ts
 *
 * Reads  tests/fixtures/shopify/raw/*.json   (gitignored)
 * Writes tests/fixtures/shopify/*.json       (committed)
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const RAW = path.join(process.cwd(), 'tests', 'fixtures', 'shopify', 'raw');
const OUT = path.join(process.cwd(), 'tests', 'fixtures', 'shopify');

const h = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 6);

const TAG_SAFELIST = new Set(['B2B', 'ispro', 'isPro', 'Shop', 'Login with Shop', 'migrated_matrixify']);

function redact(node: unknown, key: string | null): unknown {
  if (Array.isArray(node)) {
    if (key === 'tags') return (node as string[]).filter((t) => TAG_SAFELIST.has(t));
    return node.map((v) => redact(v, key));
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    // Context-aware exceptions: a line item's "name" is a product title
    // (has sku sibling); trackingInfo's "company" is a carrier. Not PII.
    const keep = new Set<string>();
    if ('sku' in obj && 'quantity' in obj) keep.add('name');
    if ('number' in obj && 'company' in obj && 'url' in obj) keep.add('company');
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, keep.has(k) ? v : redact(v, k)]),
    );
  }
  if (typeof node === 'string' && node.length > 0) {
    switch (key) {
      case 'email':
        return `user-${h(node)}@example.com`;
      case 'firstName':
        return 'Redacted';
      case 'lastName':
        return h(node);
      case 'name':
        // Order names ("#7246") and tracking company names must survive;
        // person/company address names must not.
        return node.startsWith('#') ? node : `Name-${h(node)}`;
      case 'company':
      case 'companyName':
        return `Company-${h(node)}`;
      case 'address1':
        return '1 Redacted St';
      case 'zip':
        return '00000';
      case 'phone':
        return '555-0100';
      case 'note':
        return node ? '[redacted note]' : node;
      case 'number': // tracking number
        return `TRACK-${h(node)}`;
      case 'url':
        return null;
      default:
        return node;
    }
  }
  return node;
}

function main() {
  const files = fs.readdirSync(RAW).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
    // company.name / location.name inside purchasingEntity use key "name" —
    // handled by the generic rule; explicitly redact top-level company names.
    const redacted = redact(raw, null) as any;
    if (redacted.purchasingEntity?.company?.name) {
      redacted.purchasingEntity.company.name = `Company-${h(String(raw.purchasingEntity.company.name))}`;
    }
    fs.writeFileSync(path.join(OUT, f), JSON.stringify(redacted, null, 2) + '\n');
    console.log(`redacted ${f}`);
  }
}

main();
