import { describe, expect, it, vi } from 'vitest';
import { buildLedgerDocument, classifyLine, toSalesRule, type ErpDocument, type ErpLine, type SalesRule } from '@/lib/salesLedger/classify';
import { linkDocumentToOrder } from '@/lib/salesLedger/sync';
import { reconcileCompany } from '@/lib/salesLedger/reconcile';
import { fetchErpDocuments } from '@/lib/salesLedger/netsuite';

const RULE: SalesRule = {
  historyStartDate: '2023-01-01',
  productSkuPrefixes: ['FPS', 'KIT', 'TOL', 'PROMO', 'ACC', 'SAM'],
  discountItemNames: ['Customer Discount'],
};
const CATALOG = new Map<string, number>([
  ['FPS0016', 2], ['FPS0018', 4], ['FPS0025', 11], ['FPS0027', 13], ['KIT0034', 22],
]);

let n = 0;
const line = (sku: string | null, type: string | null, qty: number | null, fa: number, extra: Partial<ErpLine> = {}): ErpLine => ({
  lineNo: ++n, sku, itemName: sku, itemType: type, isTax: false, quantity: qty, foreignAmount: fa, ...extra,
});
const doc = (over: Partial<ErpDocument>): ErpDocument => ({
  erpId: '1', type: 'invoice', tranid: 'INV1', date: '2025-01-01', currency: 'USD', exchangeRate: 1, foreignTotal: 0,
  status: 'B', memo: null, poRef: null, soErpId: null, soTranid: null, lines: [], ...over,
});

describe('classifyLine', () => {
  const cat = new Set(CATALOG.keys());
  it('catalog SKUs and configured prefixes are products; private label / services are excluded', () => {
    expect(classifyLine(line('FPS0016', 'Assembly', -1, -1), RULE, cat)).toBe('product');
    expect(classifyLine(line('FPS0007', 'Assembly', -1, -1), RULE, cat)).toBe('product'); // discontinued, by prefix
    expect(classifyLine(line('PLB0001', 'Assembly', -1, -1), RULE, cat)).toBe('excluded');
    expect(classifyLine(line('COM0099', 'InvtPart', -1, -1), RULE, cat)).toBe('excluded');
    expect(classifyLine(line('LBR0000 Labeling', 'NonInvtPart', -1, -1), RULE, cat)).toBe('excluded');
    expect(classifyLine(line('SHI0006-OLD', 'NonInvtPart', -1, -1), RULE, cat)).toBe('excluded');
  });
  it('discount items, item-less discounts and configured discount names are discounts; markups and tax excluded', () => {
    expect(classifyLine(line('Partners Support Funds', 'Discount', null, 100), RULE, cat)).toBe('discount');
    expect(classifyLine(line(null, 'Discount', null, 100), RULE, cat)).toBe('discount');
    expect(classifyLine(line('Customer Discount', 'NonInvtPart', -1, 299), RULE, cat)).toBe('discount');
    expect(classifyLine(line(null, 'Markup', null, -39.6), RULE, cat)).toBe('excluded');
    expect(classifyLine(line(null, 'TaxItem', null, -5, { isTax: true }), RULE, cat)).toBe('excluded');
  });
  it('without prefixes, only catalog products count', () => {
    expect(classifyLine(line('FPS0007', 'Assembly', -1, -1), { ...RULE, productSkuPrefixes: [] }, cat)).toBe('excluded');
  });
});

describe('buildLedgerDocument (real invoices from the 2026-10-06 audit)', () => {
  it('ANT INVIL10927: informational header discount is SF but does not reduce sales', () => {
    const d = buildLedgerDocument(doc({
      tranid: 'INVIL10927', foreignTotal: 53013.2,
      lines: [
        line('FPS0018', 'Assembly', -1140, -9690),
        line('FPS0030', 'Assembly', -1080, -14688),
        line('FPS0027', 'Assembly', -48, 5858.2), // negative-priced product line = SF
        line('FPS0017', 'Assembly', -2484, -34493.4),
        line(null, 'Discount', null, 6062.2), // net-0 header discount (SF value)
      ],
    }), RULE, CATALOG);
    expect(d.sales_amount).toBe(53013.2);
    expect(d.excluded_amount).toBe(0);
    expect(d.support_fund).toBe(11920.4);
    const fps27 = d.lines.find((l) => l.sku === 'FPS0027')!;
    expect(fps27).toMatchObject({ kind: 'product', quantity: 48, amount: -5858.2, product_id: 13 });
  });

  it('NOT ANOTHER INVIL10573: shipping excluded, free goods kept as units', () => {
    const d = buildLedgerDocument(doc({
      foreignTotal: 2580.3,
      lines: [
        line('FPS0025', 'Assembly', -96, -2064),
        line('FPS0018', 'Assembly', -12, 0),
        line(null, 'Discount', null, 102),
        line('SHI0006-OLD', 'NonInvtPart', -1, -516.3),
      ],
    }), RULE, CATALOG);
    expect(d).toMatchObject({ total_amount: 2580.3, sales_amount: 2064, excluded_amount: 516.3, support_fund: 102 });
    expect(d.lines.find((l) => l.sku === 'FPS0018')).toMatchObject({ kind: 'product', quantity: 12, amount: 0 });
  });

  it('Hub-pushed invoice: a discount item that really reduces the total stays inside sales', () => {
    const d = buildLedgerDocument(doc({
      foreignTotal: 900,
      lines: [line('FPS0016', 'Assembly', -100, -1000), line('Partners Support Funds', 'Discount', null, 100)],
    }), RULE, CATALOG);
    expect(d).toMatchObject({ sales_amount: 900, support_fund: 100 });
  });

  it('card surcharge (header markup) is excluded', () => {
    const d = buildLedgerDocument(doc({
      foreignTotal: 1170.6,
      lines: [line('KIT0034', 'Kit', -6, -1131), line(null, 'Markup', null, -39.6)],
    }), RULE, CATALOG);
    expect(d).toMatchObject({ sales_amount: 1131, excluded_amount: 39.6 });
  });

  it('foreign currency is converted with the document exchange rate', () => {
    const d = buildLedgerDocument(doc({
      currency: 'EUR', exchangeRate: 1.0919, foreignTotal: 17000,
      lines: [line('FPS0007', 'Assembly', -1000, -17000)],
    }), RULE, CATALOG);
    expect(d).toMatchObject({ currency: 'EUR', total_foreign: 17000, total_amount: 18562.3, sales_amount: 18562.3 });
    expect(d.lines[0].amount).toBe(18562.3);
  });

  it('ANT CMIL10057: returned products are negative sales; the logistics credit is excluded; no SF', () => {
    const d = buildLedgerDocument(doc({
      type: 'credit_memo', tranid: 'CMIL10057', foreignTotal: -14059.3,
      lines: [
        line('FPS0018', 'Assembly', 277, 2354.5),
        line('KIT0034', 'Assembly', 314, 4458.8),
        line('FPS0016', 'Assembly', 315, 3780),
        line('FPS0019', 'Assembly', 245, 2205),
        line('FPS0020', 'Assembly', 7, 91), line('FPS0021', 'Assembly', 2, 58), line('FPS0022', 'Assembly', 3, 57),
        line('Other charge', 'OthCharge', 1, 1055),
      ],
    }), RULE, CATALOG);
    expect(d).toMatchObject({ sales_amount: -13004.3, excluded_amount: -1055, support_fund: 0 });
    expect(d.lines.find((l) => l.sku === 'KIT0034')).toMatchObject({ quantity: -314, amount: -4458.8 });
  });

  it('a private-label-only invoice adds no sales', () => {
    const d = buildLedgerDocument(doc({
      foreignTotal: 34500, lines: [line('PLB0017', 'Assembly', -1000, -34500)],
    }), RULE, CATALOG);
    expect(d).toMatchObject({ sales_amount: 0, excluded_amount: 34500 });
  });

  it('toSalesRule reads the settings row', () => {
    expect(toSalesRule({ history_start_date: '2023-01-01', product_sku_prefixes: [' FPS ', ''], discount_item_names: null }))
      .toEqual({ historyStartDate: '2023-01-01', productSkuPrefixes: ['FPS'], discountItemNames: [] });
    expect(toSalesRule(null).historyStartDate).toBeNull();
  });
});

describe('linkDocumentToOrder', () => {
  const orders = [
    { id: 'o1', company_id: 'c', so_number: 'SOIL10725', netsuite_so_id: '484226', invoice_number: 'INVIL10926', netsuite_invoice_id: '509546' },
    { id: 'o2', company_id: 'c', so_number: 'SOIL10705', netsuite_so_id: null, invoice_number: 'INVIL10892+INVIL10903', netsuite_invoice_id: null },
    { id: 'o3', company_id: 'c', so_number: 'מחירון לא נכון', netsuite_so_id: null, invoice_number: null, netsuite_invoice_id: null },
  ];
  it('links by sales order id or number — every invoice of a backordered order', () => {
    expect(linkDocumentToOrder({ netsuite_id: '9', tranid: 'INVIL10999', netsuite_so_id: '484226', so_tranid: null }, orders)).toBe('o1');
    expect(linkDocumentToOrder({ netsuite_id: '8', tranid: 'INVIL10903', netsuite_so_id: '1', so_tranid: 'soil10705 ' }, orders)).toBe('o2');
  });
  it('falls back to the invoice recorded on the order (split "A+B" too)', () => {
    expect(linkDocumentToOrder({ netsuite_id: '509546', tranid: 'X', netsuite_so_id: null, so_tranid: null }, orders)).toBe('o1');
    expect(linkDocumentToOrder({ netsuite_id: '7', tranid: 'INVIL10892', netsuite_so_id: null, so_tranid: null }, orders)).toBe('o2');
  });
  it('a document sold outside the Hub links to nothing', () => {
    expect(linkDocumentToOrder({ netsuite_id: '6', tranid: 'INVUS16898', netsuite_so_id: '777', so_tranid: 'SOUS16892' }, orders)).toBeNull();
  });
});

describe('reconcileCompany', () => {
  const base = { doc_type: 'invoice', support_fund: 0, excluded_amount: 0, currency: 'USD', po_ref: null, memo: null, so_tranid: null };
  it('order states, outside-Hub sales, agreement boundary and the PO hint', () => {
    const r = reconcileCompany({
      contractDate: '2024-01-01',
      orders: [
        { id: 'full', po_number: 'GOOD01', status: 'Done', total_value: 1000, created_at: '2025-01-01' },
        { id: 'bo', po_number: 'BACK01', status: 'Done', total_value: 1000, created_at: '2025-01-01' },
        { id: 'open', po_number: 'OPEN01', status: 'Open', total_value: 500, created_at: '2025-02-01' },
        { id: 'redi', po_number: '7PYGR3', status: 'In Process', total_value: 600, created_at: '2026-05-04' },
        { id: 'draft', po_number: 'DRAFT1', status: 'Draft', total_value: 50, created_at: '2025-02-01' },
      ],
      documents: [
        { ...base, id: 'd1', tranid: 'INV-A', doc_date: '2025-01-05', sales_amount: 1000, order_id: 'full' },
        { ...base, id: 'd2', tranid: 'INV-B', doc_date: '2025-01-05', sales_amount: 700, order_id: 'bo' },
        { ...base, id: 'd3', tranid: 'INV-OLD', doc_date: '2023-06-01', sales_amount: 400, order_id: null },
        { ...base, id: 'd4', tranid: 'INVUS16292', doc_date: '2026-05-12', sales_amount: 1080, order_id: null, po_ref: '7PYGR3' },
        { ...base, id: 'd5', tranid: 'CM-1', doc_type: 'credit_memo', doc_date: '2025-03-01', sales_amount: -100, order_id: null },
      ],
    });
    const state = Object.fromEntries(r.orders.map((o) => [o.orderId, o.state]));
    expect(state).toEqual({ full: 'billed', bo: 'partly_billed', open: 'not_billed', redi: 'not_billed' });
    expect(r.orders.find((o) => o.orderId === 'bo')!.difference).toBe(-300);
    expect(r.totals).toEqual({
      sales: 3080, salesSinceAgreement: 2680, salesBeforeAgreement: 400, outsideHub: 1380, supportFund: 0,
      unbilledHubOrders: 300 + 500 + 600,
    });
    expect(r.documents.find((d) => d.id === 'd3')!.beforeAgreement).toBe(true);
    expect(r.documents.find((d) => d.id === 'd4')!.suggestedOrder).toEqual({ id: 'redi', poNumber: '7PYGR3' });
    expect(r.documents.find((d) => d.id === 'd5')!.suggestedOrder).toBeNull();
  });
});

describe('fetchErpDocuments (NetSuite adapter, read-only)', () => {
  it('groups by customer, normalizes dates, attaches lines and sales orders, drops voided', async () => {
    const suiteQLPaged = vi.fn(async (q: string) => {
      if (q.startsWith('SELECT t.id, t.type')) {
        return [
          { id: '10', type: 'CustInvc', tranid: 'INV10', trandate: '23/04/2026', foreigntotal: '100', exchangerate: '1', currency: 'USD', status: 'B', entity: '58392' },
          { id: '11', type: 'CustCred', tranid: 'CM11', trandate: '30/06/2025', foreigntotal: '-40', exchangerate: '1.1', currency: 'EUR', status: 'B', entity: '58392', otherrefnum: 'PO-9' },
          { id: '12', type: 'CustInvc', tranid: 'VOID', trandate: '01/01/2025', foreigntotal: '5', exchangerate: '1', currency: 'USD', status: 'V', entity: '58392' },
          { id: '13', type: 'SalesOrd', tranid: 'SO13', trandate: '01/01/2025', foreigntotal: '5', entity: '58392' },
        ];
      }
      if (q.includes('FROM transactionline')) {
        return [
          { transaction: '10', lineid: '2', taxline: 'F', itemid: 'FPS0016', displayname: 'Spray', itemtype: 'Assembly', quantity: '-10', foreignamount: '-100' },
          { transaction: '10', lineid: '3', taxline: 'F', itemid: null, linetype: 'Discount', quantity: null, foreignamount: '5' },
          { transaction: '11', lineid: '1', taxline: 'F', itemid: 'FPS0016', displayname: 'Spray', itemtype: 'Assembly', quantity: '4', foreignamount: '40' },
        ];
      }
      if (q.includes('nexttransactionlink')) return [{ previousdoc: '99', nextdoc: '10' }];
      if (q.startsWith('SELECT id, tranid FROM transaction')) return [{ id: '99', tranid: 'SOIL10728' }];
      throw new Error(`unexpected query ${q}`);
    });
    const out = await fetchErpDocuments({ suiteQLPaged } as any, [58392], '2023-01-01');
    const docs = out.get('58392')!;
    expect(docs.map((d) => d.tranid)).toEqual(['INV10', 'CM11']);
    expect(docs[0]).toMatchObject({ type: 'invoice', date: '2026-04-23', soErpId: '99', soTranid: 'SOIL10728' });
    expect(docs[0].lines.map((l) => [l.sku, l.itemType, l.foreignAmount])).toEqual([['FPS0016', 'Assembly', -100], [null, 'Discount', 5]]);
    expect(docs[1]).toMatchObject({ type: 'credit_memo', date: '2025-06-30', currency: 'EUR', exchangeRate: 1.1, poRef: 'PO-9' });
    // Read-only: only SELECT queries were issued.
    expect(suiteQLPaged.mock.calls.every(([q]) => String(q).startsWith('SELECT'))).toBe(true);
  });

  it('refuses a malformed start date (it is inlined into TO_DATE)', async () => {
    await expect(fetchErpDocuments({ suiteQLPaged: vi.fn() } as any, [1], "2023-01-01'; --")).rejects.toThrow();
  });
});
