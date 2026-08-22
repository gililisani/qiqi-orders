/**
 * Customer matching ladder — principle 5. Pure decision logic: the engine
 * runs the NS lookups (by company stamp, customer stamp, normalized email)
 * and hands the candidates here; this function only decides.
 *
 * The failure mode this replaces: NetScore stamped Shopify IDs on 7,321
 * customer records but never *matched* on them, creating up to 455
 * duplicates per salon. Here the stamp is the primary key, email is a
 * one-shot adoption fallback, and ambiguity is an error — never a guess.
 */
import type { BuyerInfo, MatchDecision, NsCustomerCandidate, ShopifyOrder } from './types';

export function extractBuyer(order: ShopifyOrder): BuyerInfo {
  const num = (gid: string | null | undefined): string | null => {
    if (!gid) return null;
    const m = /\/(\d+)$/.exec(gid);
    return m ? m[1] : gid;
  };
  const email = (order.customer?.email ?? null)?.trim().toLowerCase() || null;

  if (order.purchasingEntity?.__typename === 'PurchasingCompany') {
    const pe = order.purchasingEntity;
    const contactEmail = pe.contact?.customer?.email?.trim().toLowerCase() || null;
    return {
      kind: 'b2b',
      shopifyCustomerId: num(pe.contact?.customer?.id ?? order.customer?.id),
      shopifyCompanyId: num(pe.company.id),
      shopifyCompanyLocationId: num(pe.location?.id),
      companyName: pe.company.name,
      email: contactEmail ?? email,
      displayName: pe.company.name,
      firstName: order.customer?.firstName ?? null,
      lastName: order.customer?.lastName ?? null,
      billingAddress: order.billingAddress,
      shippingAddress: order.shippingAddress,
    };
  }

  const name = [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ');
  return {
    kind: 'b2c',
    shopifyCustomerId: num(
      order.purchasingEntity?.__typename === 'Customer' ? order.purchasingEntity.id : order.customer?.id,
    ),
    shopifyCompanyId: null,
    shopifyCompanyLocationId: null,
    companyName: null,
    email,
    displayName: name || order.customer?.email || 'Unknown customer',
    firstName: order.customer?.firstName ?? null,
    lastName: order.customer?.lastName ?? null,
    billingAddress: order.billingAddress,
    shippingAddress: order.shippingAddress,
  };
}

export function decideCustomerMatch(
  buyer: BuyerInfo,
  candidates: NsCustomerCandidate[],
  opts: { requiredSubsidiaryId?: string } = {},
): MatchDecision {
  // Owner rule (2026-08-21): every Shopify order books under Qiqi INC —
  // and NetSuite will not accept a customer that lives only in another
  // subsidiary as the order's entity. Such candidates are DISQUALIFIED
  // (logged in the issue detail), never chosen and never offered. #6599:
  // NetScore had created the same buyer in Qiqi Global AND Qiqi INC.
  const disqualified = opts.requiredSubsidiaryId
    ? candidates.filter((c) => c.subsidiaryId && c.subsidiaryId !== opts.requiredSubsidiaryId)
    : [];
  const active = candidates.filter((c) => !c.isInactive && !disqualified.includes(c));

  // Rung 1 (B2B): the company stamp IS the business identity.
  const byCompany = active.filter((c) => c.via === 'company_stamp');
  if (byCompany.length === 1) {
    return { action: 'use', nsCustomerId: byCompany[0].nsCustomerId, via: 'company_stamp', stampNeeded: false };
  }
  if (byCompany.length > 1) {
    return ambiguous(buyer, byCompany, 'multiple NS customers share this Shopify company id', disqualified);
  }

  // Rung 2: the customer stamp (NetScore's custentity_shop_cust_id — 91.7%
  // of records carry it; for B2B this matches via the buying contact).
  const byCustomer = active.filter((c) => c.via === 'customer_stamp');
  if (byCustomer.length === 1) {
    return { action: 'use', nsCustomerId: byCustomer[0].nsCustomerId, via: 'customer_stamp', stampNeeded: buyer.kind === 'b2b' };
  }
  if (byCustomer.length > 1) {
    return ambiguous(buyer, byCustomer, 'multiple NS customers share this Shopify customer id', disqualified);
  }

  // Rung 3: normalized email — adoption path for pre-Shopify-era records.
  const byEmail = active.filter((c) => c.via === 'email');
  if (byEmail.length === 1) {
    return { action: 'use', nsCustomerId: byEmail[0].nsCustomerId, via: 'email', stampNeeded: true };
  }
  if (byEmail.length > 1) {
    // The dup landscape means shared emails are real (one salon: 455
    // records). Guessing here is how NetScore corrupted the customer base.
    return ambiguous(buyer, byEmail, 'email matches multiple NS customers', disqualified);
  }

  // Rung 4: genuinely new — create WITH stamps so the next order matches on rung 1/2.
  return {
    action: 'create',
    stamp: { shopifyCustomerId: buyer.shopifyCustomerId, shopifyCompanyId: buyer.shopifyCompanyId },
  };
}

function ambiguous(
  buyer: BuyerInfo,
  cands: NsCustomerCandidate[],
  why: string,
  disqualified: NsCustomerCandidate[] = [],
): MatchDecision {
  const facts = (c: NsCustomerCandidate) => ({
    id: c.nsCustomerId,
    entityId: c.entityId,
    via: c.via,
    subsidiary: c.subsidiaryName ?? c.subsidiaryId ?? null,
    createdAt: c.createdAt ?? null,
    transactionCount: c.transactionCount ?? null,
    lastTransactionDate: c.lastTransactionDate ?? null,
  });
  return {
    action: 'error',
    issue: {
      code: 'AMBIGUOUS_CUSTOMER',
      message: `${buyer.displayName}: ${why} (${cands.length} candidates) — pick one on the dashboard`,
      detail: {
        candidates: cands.map(facts),
        disqualified: disqualified.map((c) => ({ ...facts(c), reason: 'other subsidiary' })),
      },
    },
  };
}
