import { describe, it, expect } from 'vitest';
import { generateSLIHTML } from '@/lib/sliGenerator';
import { buildStandaloneSLIData } from '@/lib/sli/buildStandaloneSLIData';
import { getSLIRenderContext } from '@/lib/sli/sliConfig';
import { createMockSupabase } from '../helpers/mockSupabase';

/**
 * End-to-end HTML render of the real template (public/templates/
 * sli-nested-tables.html) through both flows — order-based and standalone —
 * with and without the new sli_config/sli_signers data.
 */

const NEW_CONFIG = {
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
};

const NEW_SIGNER = {
  id: 'signer-2',
  name: 'Jane Doe',
  title: 'COO',
  email: 'jane@qiqiglobal.com',
  phone: '001-555-0100',
  signature_url: 'data:image/png;base64,iVBORw0KGgo=',
};

const ORDER_FLOW_DATA = {
  forwarding_agent_line1: 'ACME Forwarding',
  forwarding_agent_line2: '1 Harbor Way',
  forwarding_agent_line3: 'Newark, NJ 07102',
  forwarding_agent_line4: 'United States',
  in_bond_code: 'IB-77',
  instructions_to_forwarder: 'Handle with care',
  invoice_number: 'INV-1234',
  company_name: 'Distributor GmbH',
  ship_to_street_line_1: 'Hauptstr. 1',
  ship_to_street_line_2: '',
  ship_to_city: 'Berlin',
  ship_to_state: '',
  ship_to_postal_code: '10115',
  ship_to_country: 'Germany',
  products: [
    { hs_code: '3305.90', quantity: 100, case_qty: 10, case_weight: 5, total_price: 1500, made_in: 'USA' },
  ],
  creation_date: '2026-07-21',
};

describe('order-flow SLI HTML', () => {
  it('renders config + signer values with no leftover placeholders', () => {
    const html = generateSLIHTML({ ...ORDER_FLOW_DATA, config: NEW_CONFIG, signer: NEW_SIGNER } as any);

    // New warehouse (boxes 3, 4, 14)
    expect(html).toContain('BrandFox 3PL');
    expect(html).toContain('123 New Warehouse Rd');
    expect(html).toContain('>CA<');
    expect(html).not.toContain('PACKABLE');
    expect(html).not.toContain('Motor Parkway');

    // Signer (boxes 42-46)
    expect(html).toContain('Jane Doe');
    expect(html).toContain('jane@qiqiglobal.com');
    expect(html).toContain('001-555-0100');
    expect(html).toContain('COO');
    expect(html).toContain('data:image/png;base64,iVBORw0KGgo=');
    expect(html).not.toContain('Aaron');

    // Existing positional replacements still land (boxes 5, 9, 11, 17)
    expect(html).toContain('ACME Forwarding');
    expect(html).toContain('INV-1234');
    expect(html).toContain('Distributor GmbH');
    expect(html).toContain('IB-77');
    expect(html).toContain('Germany');

    // Nothing unreplaced
    expect(html).not.toContain('{{');
    expect(html).not.toMatch(/\{leave blank\}|\{.*from the system\}/);
  });

  it('falls back to legacy values when no config is provided (pre-migration)', () => {
    const html = generateSLIHTML({ ...ORDER_FLOW_DATA } as any);

    expect(html).toContain('PACKABLE / Webb Enterprises');
    expect(html).toContain('Qiqi INC');
    expect(html).toContain('86-2244756');
    expect(html).toContain('Aaron Lisani');
    expect(html).toContain('/templates/Sig.png');
    expect(html).not.toContain('{{');
  });
});

describe('standalone-flow SLI HTML', () => {
  it('builds data from the DB record and renders with config + signer', async () => {
    const supabase = createMockSupabase({
      tableResults: {
        Products: {
          data: [
            { id: 'p1', hs_code: '3305.10', case_weight: 4, case_pack: 12, price_international: 10, made_in: 'USA' },
          ],
          error: null,
        },
        sli_config: { data: NEW_CONFIG, error: null },
        sli_signers: { data: NEW_SIGNER, error: null },
      },
    });

    const generatorData = await buildStandaloneSLIData(
      {
        invoice_number: 'SLI-INV-9',
        consignee_name: 'Standalone Buyer Ltd',
        consignee_address_line1: '9 Export Lane',
        consignee_country: 'Israel',
        forwarding_agent_line1: 'Global Freight Co',
        selected_products: [{ product_id: 'p1', quantity: 24 }],
        signer_id: 'signer-2',
      },
      supabase
    );

    expect(generatorData.config.freight_location_name).toBe('BrandFox 3PL');
    expect(generatorData.signer.name).toBe('Jane Doe');

    const html = generateSLIHTML(generatorData);
    expect(html).toContain('BrandFox 3PL');
    expect(html).toContain('Jane Doe');
    expect(html).toContain('Standalone Buyer Ltd');
    expect(html).toContain('Global Freight Co');
    expect(html).toContain('SLI-INV-9');
    expect(html).toContain('3305.10');
    expect(html).not.toContain('{{');
  });
});

describe('getSLIRenderContext', () => {
  it('falls back to legacy defaults when the tables are missing', async () => {
    const supabase = createMockSupabase(); // every table returns { data: null }
    const { config, signer } = await getSLIRenderContext(supabase);
    expect(config.freight_location_name).toBe('PACKABLE / Webb Enterprises');
    expect(signer.name).toBe('Aaron Lisani');
  });

  it('uses DB rows when present', async () => {
    const supabase = createMockSupabase({
      tableResults: {
        sli_config: { data: NEW_CONFIG, error: null },
        sli_signers: { data: NEW_SIGNER, error: null },
      },
    });
    const { config, signer } = await getSLIRenderContext(supabase, 'signer-2');
    expect(config.state_of_origin).toBe('CA');
    expect(signer.email).toBe('jane@qiqiglobal.com');
  });
});
