#!/usr/bin/env tsx
/**
 * Billing Phase B verification: fetch one invoice PDF through the deployed
 * RESTlet and save it locally, so it can be compared against the same
 * invoice printed from the NetSuite UI. Read-only — renders a PDF inside
 * NetSuite, changes nothing.
 *
 * Usage:
 *   npx tsx scripts/verify-invoice-pdf.ts <netsuite invoice internal id>
 *   npx tsx scripts/verify-invoice-pdf.ts <netsuite invoice internal id> --payment
 *     (--payment fetches the payment-confirmation PDF for that invoice instead)
 *   npx tsx scripts/verify-invoice-pdf.ts <netsuite sales order internal id> --so
 *     (--so treats the id as a Sales Order and fetches its PDF)
 *
 * Needs in .env.local: the NETSUITE_* TBA creds plus
 * NETSUITE_INVPDF_SCRIPT_ID / NETSUITE_INVPDF_DEPLOY_ID (see
 * netsuite/INVOICE_PDF_DEPLOY.md).
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import fs from 'node:fs';
import path from 'node:path';
import { createNetSuiteAPI } from '../lib/netsuite';

async function main() {
  const invoiceId = process.argv[2];
  if (!invoiceId || !/^\d+$/.test(invoiceId)) {
    console.error('Usage: npx tsx scripts/verify-invoice-pdf.ts <netsuite invoice internal id>');
    process.exit(1);
  }

  const ns = createNetSuiteAPI();
  const paymentMode = process.argv.includes('--payment');
  const soMode = process.argv.includes('--so');
  const what = paymentMode ? 'payment confirmation for invoice' : soMode ? 'sales order' : 'invoice';
  console.log(`Fetching ${what} ${invoiceId} via the RESTlet…`);
  const { fileName, pdf } = paymentMode
    ? await ns.getPaymentConfirmationPdf(invoiceId)
    : soMode
      ? await ns.getSalesOrderPdf(invoiceId)
      : await ns.getInvoicePdf(invoiceId);

  const out = path.join(process.cwd(), fileName);
  fs.writeFileSync(out, pdf);
  console.log(`Saved ${out} (${(pdf.length / 1024).toFixed(1)} KB)`);
  console.log('Open it and compare against the same invoice printed from the NetSuite UI.');
}

main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
