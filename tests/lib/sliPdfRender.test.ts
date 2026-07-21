// End-to-end check of the PDF path: render SLIDocument to a real PDF in node
// and assert the text content for both config-driven and legacy-fallback data.
import { describe, it, expect } from 'vitest';
import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse');
import { renderToBuffer } from '@react-pdf/renderer';
// @ts-ignore - JSX-in-js component
import { SLIDocument } from '@/lib/pdf/components/SLIDocument.js';

const SIG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const configFields = {
  usppi_name: 'Qiqi INC',
  usppi_address_line1: '4625 West Nevso Drive, Suite 2',
  usppi_address_line2: 'Las Vegas, NV 89103',
  usppi_country: 'United States',
  usppi_ein: '86-2244756',
  freight_location_name: 'BrandFox 3PL',
  freight_location_address_line1: '123 New Warehouse Rd',
  freight_location_address_line2: 'Somewhere, CA, 90210',
  freight_location_country: 'United States',
  state_of_origin: 'CA',
  usppi_email: 'jane@qiqiglobal.com',
  usppi_phone: '001-555-0100',
  printed_name: 'Jane Doe',
  signer_title: 'COO',
  signature_url: SIG,
};

const base = {
  invoice_number: 'INV-1234',
  consignee_name: 'Distributor GmbH',
  consignee_address_line1: 'Hauptstr. 1',
  consignee_address_line3: 'Berlin, 10115',
  consignee_country: 'Germany',
  forwarding_agent_line1: 'ACME Forwarding',
  in_bond_code: 'IB-77',
  instructions_to_forwarder: 'Handle with care',
  sli_date: '07/21/2026',
  date_of_export: '07/22/2026',
  products: [
    { hs_code: '3305.90', total_quantity: 100, total_weight: 50, total_value: 1500, made_in: 'USA' },
  ],
  checkbox_states: { related_party_non_related: true, hazardous_material_no: true },
};

async function extractText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

describe('SLIDocument PDF render', () => {
  it('order-flow PDF renders the new config + signer', async () => {
    const buf = await renderToBuffer(
      React.createElement(SLIDocument, { data: { ...configFields, ...base, sli_number: 0 } as any }) as any
    );
    const text = await extractText(buf);
    for (const t of [
      'BrandFox 3PL', '123 New Warehouse Rd', 'Jane Doe', 'jane@qiqiglobal.com', 'COO',
      'INV-1234', 'Distributor GmbH', 'ACME Forwarding', '86-2244756',
    ]) {
      expect(text, `missing "${t}"`).toContain(t);
    }
    for (const t of ['PACKABLE', 'Aaron', 'Motor Parkway']) {
      expect(text, `should not contain "${t}"`).not.toContain(t);
    }
    expect(buf.length).toBeGreaterThan(5000);
  });

  it('standalone PDF (with sli_number) renders the new config', async () => {
    const buf = await renderToBuffer(
      React.createElement(SLIDocument, { data: { ...configFields, ...base, sli_number: 100042 } as any }) as any
    );
    const text = await extractText(buf);
    expect(text).toContain('BrandFox 3PL');
    expect(text).toContain('Jane Doe');
    expect(text).not.toContain('PACKABLE');
  });

  it('falls back to legacy values without config fields', async () => {
    // signature_url substituted with a data URL — in node '/templates/Sig.png'
    // cannot resolve against an origin like it does in the browser.
    const buf = await renderToBuffer(
      React.createElement(SLIDocument, { data: { ...base, signature_url: SIG } as any }) as any
    );
    const text = await extractText(buf);
    for (const t of [
      'PACKABLE / Webb Enterprises', 'Qiqi INC', 'Aaron Lisani',
      'aaron@qiqiglobal.com', 'CPO', '1516 Motor Parkway',
    ]) {
      expect(text, `missing "${t}"`).toContain(t);
    }
    expect(text).not.toContain('BrandFox');
  });
});
