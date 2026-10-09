/**
 * Sales ledger — turning one ERP billing document into ledger numbers.
 *
 * Pure (no I/O) so the money rules are unit-tested. The ERP adapter
 * (lib/salesLedger/netsuite.ts) supplies documents in this neutral shape.
 *
 * Rules (owner-confirmed 2026-10-06):
 *  - sales_amount = document total MINUS every excluded line. Starting from
 *    the total matters: on most invoices this account's discount lines are
 *    informational (the support-fund value is already inside $0 / negative-
 *    priced product lines), on newer ones they really reduce the total —
 *    the total is the only figure that is right in both cases.
 *  - A line is a PRODUCT when its SKU is in the Hub catalog or starts with a
 *    configured prefix (Settings → Sales; e.g. discontinued versions);
 *    a DISCOUNT when it is a discount-type item, an item-less discount line,
 *    or a configured discount item; everything else is EXCLUDED (shipping,
 *    card fees / surcharges, services, private label, other charges, tax).
 *  - Amounts are converted to the reporting currency with the exchange rate
 *    recorded on the document.
 *  - support_fund (SF redeemed) = the discount lines that reduce an invoice
 *    or cash sale ("all discounts are support funds", owner 2026-08-20).
 *    A negative-priced product line NEXT TO a discount line is that same
 *    discount applied to the line (gross − discount: INVIL10879 shows
 *    24 × 5.95 − 4,649.40 = −4,506.60) — counting both doubled the figure
 *    (all 86 such invoices, and every Hub-linked one matched the Hub's
 *    claimed SF once fixed, 2026-10-07). Negative product lines count only
 *    on documents with no discount line. Credit memos redeem nothing.
 *  - credit_base_amount = the part of sales that EARNS support funds: the
 *    document's sales split by the share of products that earn (catalog
 *    flag `qualifies_for_credit_earning`; an item outside the catalog
 *    follows its family — a SKU family whose catalog items all don't earn,
 *    e.g. kits, doesn't earn). Splitting the NET sales (not gross product
 *    lines) keeps goods paid for with support funds from earning more
 *    support funds, whichever way the invoice recorded them.
 */

export type ErpDocType = 'invoice' | 'credit_memo' | 'cash_sale' | 'cash_refund';
/** How NetSuite links a credit to the invoice it credits (see netsuite.ts traceCreditedInvoices). */
export type CreditLink = 'created_from' | 'return_authorization' | 'return_authorization_order';
export type LineKind = 'product' | 'discount' | 'excluded';

export interface SalesRule {
  historyStartDate: string | null; // YYYY-MM-DD; null = sync off
  productSkuPrefixes: string[];
  discountItemNames: string[];
}

export interface ErpLine {
  lineNo: number;
  sku: string | null; // null = item-less line (header discount / markup)
  itemName: string | null;
  itemType: string | null; // ERP item type, or the line type for item-less lines
  isTax: boolean;
  quantity: number | null; // ERP sign as-is
  foreignAmount: number; // ERP sign as-is (revenue negative on invoices)
}

export interface ErpDocument {
  erpId: string;
  type: ErpDocType;
  tranid: string;
  date: string; // YYYY-MM-DD
  currency: string;
  exchangeRate: number;
  foreignTotal: number;
  status: string | null;
  memo: string | null;
  poRef: string | null;
  soErpId: string | null;
  soTranid: string | null;
  lines: ErpLine[];
  /** Credits only: the invoice(s) NetSuite links the credit to, and how. */
  creditedInvoices?: Array<{ erpId: string; tranid: string }>;
  creditLink?: CreditLink | null;
}

export interface LedgerLine {
  line_no: number;
  kind: LineKind;
  product_id: number | null;
  sku: string | null;
  item_name: string | null;
  item_type: string | null;
  quantity: number;
  amount: number;
}

export interface CatalogProduct {
  id: number;
  earnsSupportFund: boolean;
}

export interface LedgerDocument {
  netsuite_id: string;
  doc_type: ErpDocType;
  tranid: string;
  doc_date: string;
  currency: string;
  exchange_rate: number;
  total_foreign: number;
  total_amount: number;
  sales_amount: number;
  excluded_amount: number;
  support_fund: number;
  credit_base_amount: number;
  netsuite_so_id: string | null;
  so_tranid: string | null;
  po_ref: string | null;
  memo: string | null;
  ns_status: string | null;
  credited_invoice_ns_ids: string[];
  credited_invoice_tranids: string[];
  credit_link: CreditLink | null;
  lines: LedgerLine[];
}

const round2 = (n: number) => Math.round(n * 100) / 100 || 0; // never -0
const norm = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase();

export function classifyLine(line: ErpLine, rule: SalesRule, catalogSkus: Set<string>): LineKind {
  if (line.isTax) return 'excluded';
  const sku = norm(line.sku);
  const type = line.itemType ?? '';
  if (!sku) return type === 'Markup' ? 'excluded' : 'discount';
  if (type === 'Discount') return 'discount';
  if (catalogSkus.has(sku)) return 'product';
  if (rule.productSkuPrefixes.some((p) => norm(p) && sku.startsWith(norm(p)))) return 'product';
  const name = norm(line.itemName);
  if (rule.discountItemNames.some((n) => norm(n) && (norm(n) === sku || norm(n) === name))) return 'discount';
  return 'excluded';
}

const family = (sku: string) => sku.replace(/\d.*$/, '');

/** Does a product SKU earn support funds? Catalog flag; otherwise its family's. */
export function makeEarnsSupportFund(catalog: Map<string, CatalogProduct>): (sku: string) => boolean {
  const families = new Map<string, { earn: number; noEarn: number }>();
  for (const [sku, p] of catalog) {
    const f = families.get(family(sku)) ?? { earn: 0, noEarn: 0 };
    if (p.earnsSupportFund) f.earn += 1;
    else f.noEarn += 1;
    families.set(family(sku), f);
  }
  return (rawSku: string) => {
    const sku = norm(rawSku);
    const product = catalog.get(sku);
    if (product) return product.earnsSupportFund;
    const f = families.get(family(sku));
    return !(f && f.earn === 0 && f.noEarn > 0);
  };
}

/**
 * Ledger numbers for one document. `catalog` = Hub catalog (upper-cased
 * SKU → product id + whether it earns support funds); catalog SKUs always
 * count as products.
 */
export function buildLedgerDocument(
  doc: ErpDocument,
  rule: SalesRule,
  catalog: Map<string, CatalogProduct>
): LedgerDocument {
  const catalogSkus = new Set(catalog.keys());
  const earns = makeEarnsSupportFund(catalog);
  const rate = Number.isFinite(doc.exchangeRate) && doc.exchangeRate > 0 ? doc.exchangeRate : 1;
  const redeems = doc.type === 'invoice' || doc.type === 'cash_sale';

  let excludedForeign = 0;
  let discountRedeemed = 0;
  let productRedeemed = 0;
  let productsForeign = 0;
  let earningForeign = 0;
  const lines: LedgerLine[] = [];
  for (const line of doc.lines) {
    const kind = classifyLine(line, rule, catalogSkus);
    const effect = -(Number(line.foreignAmount) || 0); // effect on the document total
    const units = -(Number(line.quantity) || 0);
    if (kind === 'excluded') excludedForeign += effect;
    if (redeems && effect < 0) {
      if (kind === 'discount') discountRedeemed += -effect;
      else if (kind === 'product') productRedeemed += -effect;
    }
    if (kind === 'product') {
      productsForeign += effect;
      if (earns(line.sku ?? '')) earningForeign += effect;
    }
    if (effect === 0 && kind !== 'product') continue; // informational zero lines add nothing
    lines.push({
      line_no: line.lineNo,
      kind,
      product_id: kind === 'product' ? catalog.get(norm(line.sku))?.id ?? null : null,
      sku: line.sku ? line.sku.trim() : null,
      item_name: line.itemName ? line.itemName.trim() : null,
      item_type: line.isTax ? 'Tax' : line.itemType,
      quantity: round2(units),
      amount: round2(effect * rate),
    });
  }

  const salesForeign = doc.foreignTotal - excludedForeign;
  const sfForeign = discountRedeemed > 0 ? discountRedeemed : productRedeemed;
  // Earning share of the net sales; 0 when there are no product lines or the
  // signs disagree (e.g. a credit that isn't a product return).
  const earningShare =
    productsForeign !== 0 && Math.sign(productsForeign) === Math.sign(salesForeign)
      ? Math.min(1, Math.max(0, earningForeign / productsForeign))
      : 0;

  return {
    netsuite_id: doc.erpId,
    doc_type: doc.type,
    tranid: doc.tranid,
    doc_date: doc.date,
    currency: doc.currency || 'USD',
    exchange_rate: rate,
    total_foreign: round2(doc.foreignTotal),
    total_amount: round2(doc.foreignTotal * rate),
    sales_amount: round2(salesForeign * rate),
    excluded_amount: round2(excludedForeign * rate),
    support_fund: round2(sfForeign * rate),
    credit_base_amount: round2(salesForeign * earningShare * rate),
    netsuite_so_id: doc.soErpId,
    so_tranid: doc.soTranid,
    po_ref: doc.poRef?.trim() || null,
    memo: doc.memo?.trim() || null,
    ns_status: doc.status,
    credited_invoice_ns_ids: (doc.creditedInvoices ?? []).map((i) => i.erpId),
    credited_invoice_tranids: (doc.creditedInvoices ?? []).map((i) => i.tranid),
    credit_link: doc.creditedInvoices?.length ? doc.creditLink ?? null : null,
    lines,
  };
}

/**
 * When NetSuite points a credit at several invoices (a Return Authorization
 * on a sales order billed in more than one invoice), keep the one invoice
 * that holds every product the credit returns — if exactly one does.
 * Otherwise the candidates stay as they are (the admin picks).
 */
export function narrowCreditedInvoices(credit: ErpDocument, docsByErpId: Map<string, ErpDocument>): ErpDocument {
  const candidates = credit.creditedInvoices ?? [];
  if (candidates.length < 2) return credit;
  const skusOf = (d: ErpDocument) => new Set(d.lines.map((l) => norm(l.sku)).filter(Boolean));
  const returned = skusOf(credit);
  if (returned.size === 0) return credit;
  const holding = candidates.filter((c) => {
    const inv = docsByErpId.get(c.erpId);
    if (!inv) return false;
    const sold = skusOf(inv);
    return [...returned].every((sku) => sold.has(sku));
  });
  return holding.length === 1 ? { ...credit, creditedInvoices: holding } : credit;
}

export function toSalesRule(row: any): SalesRule {
  const list = (v: unknown) =>
    Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : [];
  return {
    historyStartDate: row?.history_start_date ? String(row.history_start_date).slice(0, 10) : null,
    productSkuPrefixes: list(row?.product_sku_prefixes),
    discountItemNames: list(row?.discount_item_names),
  };
}
