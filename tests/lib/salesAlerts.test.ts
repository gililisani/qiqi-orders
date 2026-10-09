import { describe, expect, it } from 'vitest';
import { buildAlertEmail, collectIssues, newIssues } from '@/lib/salesLedger/alerts';

const doc = (o: Record<string, any>) =>
  ({
    company_id: 'c1',
    doc_type: 'invoice',
    order_id: null,
    sales_amount: 100,
    support_fund: 0,
    doc_date: '2026-10-01',
    tranid: 'INV',
    ...o,
  }) as any;

const order = (o: Record<string, any>) =>
  ({ company_id: 'c1', status: 'Done', total_value: 1000, created_at: '2026-09-01T00:00:00Z', po_number: 'PO', ...o }) as any;

const base = {
  companyNames: new Map([['c1', 'Evolve <Salon>']]),
  syncFailures: [] as Array<{ company_id: string; last_error: string }>,
  today: '2026-10-09',
};

describe('collectIssues', () => {
  it('documents waiting for a decision; linked, decided and empty ones are not issues', () => {
    const docs = [
      doc({ id: 'd1', tranid: 'INVUS1', sales_amount: 1239 }), // waiting
      doc({ id: 'd2', tranid: 'INVUS2', order_id: 'o1', sales_amount: 1000 }), // NetSuite linked it to a live Hub order
      doc({ id: 'd3', tranid: 'INVUS3' }), // decided
      doc({ id: 'd4', tranid: 'INVPL', sales_amount: 0 }), // nothing to count
      doc({ id: 'd5', tranid: 'CM1', doc_type: 'credit_memo', sales_amount: -50 }), // waiting credit
    ];
    const reviews = new Map<string, any>([['d3', { document_id: 'd3', decision: 'outside_sale' }]]);
    const issues = collectIssues({ ...base, docs, orders: [order({ id: 'o1' })], reviews });
    expect(issues.filter((i) => i.kind === 'document').map((i) => i.key)).toEqual(['doc:d1', 'doc:d5']);
    expect(issues.find((i) => i.key === 'doc:d1')!.text).toBe('Invoice INVUS1 · 2026-10-01 · $1,239.00');
  });

  it('Hub orders billed differently, including invoices an admin attached', () => {
    const docs = [
      doc({ id: 'a', order_id: 'o1', sales_amount: 600 }), // o1: 1000 ordered, 600 billed
      doc({ id: 'b', order_id: 'o2', sales_amount: 1000 }), // o2: billed exactly
      doc({ id: 'c', sales_amount: 1200 }), // attached by an admin to o3 (ordered 1000)
    ];
    const reviews = new Map<string, any>([['c', { document_id: 'c', decision: 'attach', order_id: 'o3' }]]);
    const orders = [order({ id: 'o1', po_number: 'BACK1' }), order({ id: 'o2' }), order({ id: 'o3', po_number: 'MORE3' })];
    const issues = collectIssues({ ...base, docs, orders, reviews }).filter((i) => i.kind === 'order');
    expect(issues.map((i) => i.key).sort()).toEqual(['order:o1:partly_billed', 'order:o3:billed_more']);
    expect(issues.find((i) => i.key === 'order:o1:partly_billed')!.text).toContain('billed less than the Hub order');
  });

  it('sync failures alert once per day', () => {
    const issues = collectIssues({ ...base, docs: [], orders: [], reviews: new Map(), syncFailures: [{ company_id: 'c1', last_error: 'timeout' }] });
    expect(issues).toEqual([expect.objectContaining({ key: 'sync:c1:2026-10-09', text: 'NetSuite sync failed: timeout' })]);
  });
});

describe('newIssues', () => {
  it('drops everything already emailed', () => {
    const issues = [{ key: 'doc:1' }, { key: 'doc:2' }] as any;
    expect(newIssues(issues, new Set(['doc:1']))).toEqual([{ key: 'doc:2' }]);
  });
});

describe('buildAlertEmail', () => {
  it('summarizes in the subject, groups by company and escapes every value', () => {
    const { subject, html } = buildAlertEmail(
      [
        { key: 'doc:1', kind: 'document', companyId: 'c1', company: 'Evolve <Salon>', text: 'Invoice <X> · 2026-10-01 · $1.00' },
        { key: 'order:o:partly_billed', kind: 'order', companyId: 'c1', company: 'Evolve <Salon>', text: 'Hub order P1 billed less' },
      ],
      'https://example.test/admin/reports/netsuite-review'
    );
    expect(subject).toBe('NetSuite review: 1 NetSuite document to decide, 1 order billed differently');
    expect(html).toContain('Evolve &lt;Salon&gt;');
    expect(html).toContain('Invoice &lt;X&gt;');
    expect(html).not.toContain('<Salon>');
    expect(html).toContain('https://example.test/admin/reports/netsuite-review');
  });
});
