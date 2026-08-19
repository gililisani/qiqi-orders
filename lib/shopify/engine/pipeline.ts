/**
 * L3 ENGINE — Loop A ensure-pipeline: OrderPlan → NS Customer + SO +
 * Invoice + Payment(s).
 *
 * Every step is an "ensure": look up by our externalid namespace → adopt
 * if found, create if not. Any run can die at any point and be re-run;
 * nothing ever duplicates. NetScore-era records are recognized via their
 * custentity_shop_cust_id stamps (customers); order-level adoption of
 * their SO/Invoice chains is Loop D's concern (they carry no externalid).
 *
 * The pipeline throws PipelineError with a typed issue — the caller
 * (poller / backfill) parks the order in the error state. No partial
 * guesses: e.g. an order with tax lines but no configured tax item stops
 * BEFORE the SO is created.
 */
import { centsToDecimal } from '../core/money';
import { decideCustomerMatch } from '../core/customerMatch';
import type { NsCustomerCandidate, OrderPlan, SyncIssue } from '../core/types';
import { gatewayAccountId, type EngineConfig } from './config';

/** The NetSuiteAPI surface the pipeline needs (test seam). */
export interface NsApi {
  findRecordIdByExternalId(recordType: string, externalId: string): Promise<string | null>;
  createRecord(recordType: string, payload: Record<string, unknown>): Promise<string>;
  updateRecord(recordType: string, id: string, payload: Record<string, unknown>): Promise<void>;
  transformRecord(fromType: string, fromId: string, toType: string, body: Record<string, unknown>): Promise<string>;
  suiteQL<T = Record<string, unknown>>(query: string): Promise<T[]>;
  resolveItemIdsBySku(skus: string[]): Promise<Map<string, string>>;
}

export class PipelineError extends Error {
  constructor(public readonly issue: SyncIssue) {
    super(issue.message);
  }
}

export interface PipelineResult {
  nsCustomerId: string;
  nsSoId: string;
  nsInvoiceId: string;
  nsPaymentIds: string[];
  /** Which steps actually created records (vs adopting existing ones). */
  created: { customer: boolean; so: boolean; invoice: boolean; payments: number };
  customerVia: 'external_id' | NsCustomerCandidate['via'] | 'created';
}

const esc = (s: string) => s.replace(/'/g, "''");

export async function runOrderPipeline(
  plan: OrderPlan,
  ns: NsApi,
  config: EngineConfig,
): Promise<PipelineResult> {
  const created = { customer: false, so: false, invoice: false, payments: 0 };

  // ---- step 0: preflight — everything that would make a partial chain ----
  for (const payment of plan.payments) {
    if (!gatewayAccountId(config, payment.gateway)) {
      throw new PipelineError({
        code: 'UNSUPPORTED_SOURCE',
        message: `${plan.orderName}: no clearing account configured for gateway "${payment.gateway}"`,
      });
    }
  }
  const merchantTax = plan.taxLines.filter((t) => !t.channelLiable);
  const channelTax = plan.taxLines.filter((t) => t.channelLiable);
  if (merchantTax.length > 0 && !config.taxItems.merchantLiable) {
    throw new PipelineError({
      code: 'UNSUPPORTED_SOURCE',
      message: `${plan.orderName}: order carries merchant-liable tax but no pass-through tax item is configured in NS`,
    });
  }
  if (channelTax.length > 0 && !config.taxItems.channelLiable) {
    throw new PipelineError({
      code: 'UNSUPPORTED_SOURCE',
      message: `${plan.orderName}: order carries channel-liable (Shop-remitted) tax but no marketplace tax item is configured in NS`,
    });
  }

  const itemIds = await ns.resolveItemIdsBySku(plan.lines.map((l) => l.sku));
  const missing = plan.lines.filter((l) => !itemIds.get(l.sku));
  if (missing.length > 0) {
    throw new PipelineError({
      code: 'UNKNOWN_SKU',
      message: `${plan.orderName}: SKUs not found in NS: ${missing.map((l) => l.sku).join(', ')}`,
    });
  }

  // ---- step 1: ensure customer ----
  const { nsCustomerId, via, wasCreated } = await ensureCustomer(plan, ns, config);
  created.customer = wasCreated;

  // Tax lines (exact Shopify amounts, per jurisdiction) go on the INVOICE,
  // not the SO: NS forbids charge items on Sales Orders (owner-confirmed;
  // REST additionally accepts only inventory items on SO lines here), and
  // the invoice is the legal money document anyway. The SO stays a clean
  // warehouse doc: products + shipping.
  const taxLines: Array<Record<string, unknown>> = [];
  for (const [lines, itemId] of [
    [merchantTax, config.taxItems.merchantLiable],
    [channelTax, config.taxItems.channelLiable],
  ] as const) {
    for (const t of lines) {
      taxLines.push({
        item: { id: itemId! },
        quantity: 1,
        amount: Number(centsToDecimal(t.amountCents)),
        description: t.title,
      });
    }
  }

  // ---- step 2: ensure sales order (products + shipping only) ----
  // Lines book at CATALOG price; the order's discounts go on the header
  // via the "Shopify Discount" item (→ 420000 Sales Discounts) so given
  // discounts are visible and reportable. Totals still equal Shopify's.
  const discountCents = plan.lines.reduce((s, l) => s + l.discountCents, 0);
  const soExtId = config.externalIds.salesOrder(plan.shopifyOrderId);
  let nsSoId = await ns.findRecordIdByExternalId('salesOrder', soExtId);
  if (!nsSoId) {
    const itemLines: Array<Record<string, unknown>> = plan.lines.map((l) => ({
      item: { id: itemIds.get(l.sku)! },
      quantity: l.quantity,
      amount: Number(centsToDecimal(l.netAmountCents + l.discountCents)),
      description: l.description,
    }));
    nsSoId = await ns.createRecord('salesOrder', {
      externalId: soExtId,
      entity: { id: nsCustomerId },
      subsidiary: { id: config.subsidiaryId },
      tranDate: plan.processedAt.slice(0, 10),
      otherRefNum: plan.poNumber ?? plan.orderName,
      memo: `Shopify ${plan.orderName}${plan.discountCodes.length ? ` · discount: ${plan.discountCodes.join(', ')}` : ''}`,
      custbody_shopify_order_id: Number(plan.shopifyOrderId),
      shippingCost: plan.shipping ? Number(centsToDecimal(plan.shipping.amountCents)) : 0,
      ...(plan.shipping ? { shipMethod: { id: config.shipMethodId } } : {}),
      ...(discountCents > 0
        ? { discountItem: { id: config.discountItemId }, discountRate: Number(centsToDecimal(-discountCents)) }
        : {}),
      item: { items: itemLines },
    });
    created.so = true;
  }

  // ---- step 3: ensure invoice ----
  const invExtId = config.externalIds.invoice(plan.shopifyOrderId);
  let nsInvoiceId = await ns.findRecordIdByExternalId('invoice', invExtId);
  if (!nsInvoiceId) {
    nsInvoiceId = await ns.transformRecord('salesOrder', nsSoId, 'invoice', {
      externalId: invExtId,
      tranDate: plan.processedAt.slice(0, 10),
      custbody_shopify_order_id: Number(plan.shopifyOrderId),
      // Extra item lines in the transform body APPEND to the SO's lines
      // (verified empirically 2026-08-18) — the invoice carries the exact
      // per-jurisdiction tax amounts on the pass-through items.
      ...(taxLines.length ? { item: { items: taxLines } } : {}),
    });
    created.invoice = true;
  }

  // ---- step 4: ensure one payment per successful gateway transaction ----
  const nsPaymentIds: string[] = [];
  for (const payment of plan.payments) {
    const payExtId = config.externalIds.payment(payment.shopifyTransactionId);
    let payId = await ns.findRecordIdByExternalId('customerpayment', payExtId);
    if (!payId) {
      payId = await ns.transformRecord('invoice', nsInvoiceId, 'customerpayment', {
        externalId: payExtId,
        tranDate: payment.processedAt.slice(0, 10),
        account: { id: gatewayAccountId(config, payment.gateway)! },
        payment: Number(centsToDecimal(payment.amountCents)),
        memo: `Shopify ${plan.orderName} · ${payment.gateway}`,
      });
      created.payments += 1;
    }
    nsPaymentIds.push(payId);
  }

  return { nsCustomerId, nsSoId, nsInvoiceId, nsPaymentIds, created, customerVia: via };
}

async function ensureCustomer(
  plan: OrderPlan,
  ns: NsApi,
  config: EngineConfig,
): Promise<{ nsCustomerId: string; via: PipelineResult['customerVia']; wasCreated: boolean }> {
  const buyer = plan.buyer;
  const buyerKey =
    buyer.kind === 'b2b' && buyer.shopifyCompanyId
      ? `CO-${buyer.shopifyCompanyId}`
      : `CUST-${buyer.shopifyCustomerId}`;
  const extId = config.externalIds.customer(buyerKey);

  // Rung 0: our own stamp from a previous run.
  const byExt = await ns.findRecordIdByExternalId('customer', extId);
  if (byExt) return { nsCustomerId: byExt, via: 'external_id', wasCreated: false };

  // Gather candidates for the pure decision ladder.
  const candidates: NsCustomerCandidate[] = [];
  const classification = new Map<string, { category: string | null; class: string | null; terms: string | null }>();
  const note = (r: any) =>
    classification.set(String(r.id), { category: r.category ?? null, class: r.custentity3 ?? null, terms: r.terms ?? null });
  if (buyer.shopifyCustomerId) {
    const rows = await ns.suiteQL<any>(
      `SELECT id, entityid, companyname, email, isinactive, category, custentity3, terms FROM customer WHERE custentity_shop_cust_id = ${Number(buyer.shopifyCustomerId)}`,
    );
    rows.forEach(note);
    candidates.push(
      ...rows.map((r) => ({
        nsCustomerId: String(r.id),
        entityId: r.entityid,
        companyName: r.companyname,
        email: r.email,
        isInactive: r.isinactive === 'T',
        via: 'customer_stamp' as const,
      })),
    );
  }
  if (buyer.email) {
    const rows = await ns.suiteQL<any>(
      `SELECT id, entityid, companyname, email, isinactive, category, custentity3, terms FROM customer WHERE LOWER(email) = '${esc(buyer.email)}'`,
    );
    rows.forEach(note);
    const seen = new Set(candidates.map((c) => c.nsCustomerId));
    candidates.push(
      ...rows
        .filter((r) => !seen.has(String(r.id)))
        .map((r) => ({
          nsCustomerId: String(r.id),
          entityId: r.entityid,
          companyName: r.companyname,
          email: r.email,
          isInactive: r.isinactive === 'T',
          via: 'email' as const,
        })),
    );
  }

  const decision = decideCustomerMatch(buyer, candidates);
  if (decision.action === 'error') throw new PipelineError(decision.issue);

  if (decision.action === 'use') {
    // Adopt: stamp our externalid (+ their field if absent) so rung 0 hits next time.
    const stamp: Record<string, unknown> = { externalId: extId };
    if (decision.stampNeeded && buyer.shopifyCustomerId) {
      // NetScore built the field as Integer — 13-digit Shopify ids are
      // still far below 2^53, so Number is exact.
      stamp.custentity_shop_cust_id = Number(buyer.shopifyCustomerId);
    }
    // This account makes Category/Class mandatory — PATCH re-validates the
    // whole record, so records missing them must be filled with the
    // account's own per-kind convention or the stamp write bounces.
    const defaults = config.customerDefaults[buyer.kind];
    const known = classification.get(decision.nsCustomerId);
    if (!known?.category) stamp.category = { id: defaults.category };
    if (!known?.class) stamp.custentity3 = { id: defaults.class };
    // Terms: fill only when missing — never fight an existing arrangement.
    if (!known?.terms) stamp.terms = { id: config.termsId };
    await ns.updateRecord('customer', decision.nsCustomerId, stamp);
    return { nsCustomerId: decision.nsCustomerId, via: decision.via, wasCreated: false };
  }

  // Create — always with stamps, per principle 5.
  const defaults = config.customerDefaults[buyer.kind];
  // Address book: CPA wants sales-by-state visible on the customer record.
  const addressItems: Array<Record<string, unknown>> = [];
  const toNsAddress = (a: NonNullable<typeof buyer.billingAddress>) => ({
    addressee: a.name ?? buyer.displayName,
    addr1: a.address1,
    city: a.city,
    state: a.provinceCode,
    zip: a.zip,
    country: { id: a.countryCodeV2 ?? 'US' },
  });
  const billing = buyer.billingAddress;
  const shipping = buyer.shippingAddress;
  const sameAddress =
    billing && shipping && billing.address1 === shipping.address1 && billing.zip === shipping.zip;
  if (billing) {
    addressItems.push({
      defaultBilling: true,
      defaultShipping: Boolean(sameAddress || !shipping),
      addressBookAddress: toNsAddress(billing),
    });
  }
  if (shipping && !sameAddress) {
    addressItems.push({ defaultShipping: true, addressBookAddress: toNsAddress(shipping) });
  }
  const payload: Record<string, unknown> = {
    externalId: extId,
    subsidiary: { id: config.subsidiaryId },
    email: buyer.email,
    custentity_shop_cust_id: buyer.shopifyCustomerId ? Number(buyer.shopifyCustomerId) : null,
    category: { id: defaults.category },
    custentity3: { id: defaults.class },
    terms: { id: config.termsId },
    salesRep: { id: config.salesRepId },
    ...(addressItems.length ? { addressBook: { items: addressItems } } : {}),
  };
  if (buyer.kind === 'b2b') {
    payload.isPerson = false;
    payload.companyName = buyer.companyName ?? buyer.displayName;
  } else {
    payload.isPerson = true;
    payload.firstName = buyer.firstName ?? buyer.displayName;
    payload.lastName = buyer.lastName ?? '';
  }
  const nsCustomerId = await ns.createRecord('customer', payload);
  return { nsCustomerId, via: 'created', wasCreated: true };
}
