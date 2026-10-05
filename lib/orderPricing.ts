/**
 * Server-side order pricing validation — the gate between client-writable
 * order rows and money-bearing systems (NetSuite, Stripe).
 *
 * The browser computes and writes `order_items.unit_price`, `total_price`,
 * `orders.total_value`, `credit_earned` and `support_fund_used` directly
 * (RLS restricts rows, not columns). Nothing stops a tampered request from
 * storing any price it likes — so before those numbers reach an invoice,
 * this module recomputes every one of them from the catalog and rejects on
 * mismatch.
 *
 * The math EXACTLY mirrors the order forms (ClientOrderFormView /
 * AdminOrderFormView / useOrderFormController):
 *   unit price   = the company's pricing tier price (resolveUnitPrice), or
 *                  the line's admin price override when price_override is set
 *   line total   = quantity × unit_price
 *   earned       = Σ(non-SF line totals where qualifies_for_credit_earning)
 *                  × tier% / 100
 *   sf used      = min(Σ SF line totals, earned)      (capped — see docs)
 *   total_value  = Σ non-SF line totals + max(0, Σ SF line totals − earned)
 *
 * A mismatch does NOT always mean tampering: editing a product's catalog
 * price after an order was placed also trips it. The violation text is
 * written so the admin can tell which case they're in.
 */

/** Cent-level slack for float arithmetic the browser did in doubles. */
const EPSILON = 0.011;

/**
 * Pricing tiers. A company's tier is `companies.price_tier` when set, and
 * otherwise follows its NetSuite class (the automatic default). The tier is
 * a Hub-only commercial decision: the NetSuite class keeps driving
 * accounting/reporting, so a distributor can pay Salon prices while staying
 * a distributor in NetSuite (owner 2026-10-05, Simply Natural).
 */
export const PRICE_TIERS = ['americas', 'international', 'salon', 'msrp'] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export const PRICE_TIER_LABELS: Record<PriceTier, string> = {
  americas: 'Americas distributor',
  international: 'International distributor',
  salon: 'Salon',
  msrp: 'MSRP (consumer)',
};

export interface PricingContext {
  /** companies.price_tier — null/unknown = automatic (from the class). */
  priceTier?: string | null;
  /** The company's NetSuite class name (drives the automatic tier). */
  className?: string | null;
}

export interface TierPricedProduct {
  price_americas: number | string | null;
  price_international: number | string | null;
  salon_price?: number | string | null;
  msrp?: number | string | null;
}

/** The tier a company actually pays. Explicit tier wins; otherwise the
 *  tolerant class rule — substring match, never strict-equal (2026-05-28). */
export function effectivePriceTier(ctx: PricingContext): PriceTier {
  const explicit = (ctx.priceTier || '').toLowerCase().trim();
  if ((PRICE_TIERS as readonly string[]).includes(explicit)) return explicit as PriceTier;
  return (ctx.className || '').toLowerCase().includes('america') ? 'americas' : 'international';
}

/** A product's catalog price at a tier; null when the catalog has none
 *  (e.g. a pro-use product has no MSRP) — never silently priced at $0. */
export function priceForTier(tier: PriceTier, product: TierPricedProduct): number | null {
  const raw =
    tier === 'americas'
      ? product.price_americas
      : tier === 'international'
        ? product.price_international
        : tier === 'salon'
          ? product.salon_price
          : product.msrp;
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Unit price a company pays for a product (null = not priced at its tier). */
export function resolveUnitPrice(ctx: PricingContext, product: TierPricedProduct): number | null {
  return priceForTier(effectivePriceTier(ctx), product);
}

export interface PricingItemInput {
  quantity: number | null;
  unit_price: number | string | null;
  total_price: number | string | null;
  is_support_fund_item: boolean | null;
  /** Admin-set manual price — the stored unit_price IS the price. */
  price_override?: boolean | null;
  product: (TierPricedProduct & {
    sku: string | null;
    qualifies_for_credit_earning: boolean | null;
  }) | null;
}

export interface PricingViolation {
  field: string;
  sku: string | null;
  stored: number;
  expected: number;
  detail: string;
}

export interface OrderPricingResult {
  ok: boolean;
  violations: PricingViolation[];
}

export function validateOrderPricing(args: {
  items: PricingItemInput[];
  companyClassName: string | null | undefined;
  /** companies.price_tier (null = automatic from the class). */
  companyPriceTier?: string | null;
  /** Company's support-fund tier percent; 0 / null when not enrolled. */
  supportFundPercent: number | null | undefined;
  orderTotalValue: number | string | null;
  orderCreditEarned: number | string | null;
  orderSupportFundUsed: number | string | null;
}): OrderPricingResult {
  const violations: PricingViolation[] = [];
  const pct = Number(args.supportFundPercent) || 0;
  const tier = effectivePriceTier({
    priceTier: args.companyPriceTier,
    className: args.companyClassName,
  });

  let regularSubtotal = 0;
  let creditEarningSubtotal = 0;
  let sfSubtotal = 0;

  for (const item of args.items) {
    const sku = item.product?.sku ?? null;
    const qty = Number(item.quantity) || 0;
    const storedUnit = Number(item.unit_price) || 0;
    const storedTotal = Number(item.total_price) || 0;

    if (item.price_override) {
      // Admin-set price: no catalog comparison, but it must be a real price.
      if (!(storedUnit >= 0)) {
        violations.push({
          field: 'unit_price',
          sku,
          stored: storedUnit,
          expected: 0,
          detail: `${sku ?? 'item'}: manual price $${storedUnit.toFixed(2)} is not a valid price.`,
        });
      }
    } else if (item.product) {
      const catalogUnit = priceForTier(tier, item.product);
      if (catalogUnit === null) {
        violations.push({
          field: 'unit_price',
          sku,
          stored: storedUnit,
          expected: 0,
          detail:
            `${sku ?? 'item'}: the catalog has no ${PRICE_TIER_LABELS[tier]} price for this ` +
            `product. Set one on the product, or give the line a manual price.`,
        });
      } else if (Math.abs(storedUnit - catalogUnit) > EPSILON) {
        violations.push({
          field: 'unit_price',
          sku,
          stored: storedUnit,
          expected: catalogUnit,
          detail:
            `${sku ?? 'item'}: stored unit price $${storedUnit.toFixed(2)} ≠ ${PRICE_TIER_LABELS[tier]} ` +
            `catalog price $${catalogUnit.toFixed(2)}. Either the order was tampered with, or the ` +
            `product's catalog price or the company's pricing tier changed after the order was saved.`,
        });
      }
    }

    const expectedLineTotal = qty * storedUnit;
    if (Math.abs(storedTotal - expectedLineTotal) > EPSILON) {
      violations.push({
        field: 'total_price',
        sku,
        stored: storedTotal,
        expected: expectedLineTotal,
        detail:
          `${sku ?? 'item'}: line total $${storedTotal.toFixed(2)} ≠ quantity ${qty} × ` +
          `unit $${storedUnit.toFixed(2)} = $${expectedLineTotal.toFixed(2)}.`,
      });
    }

    if (item.is_support_fund_item) {
      sfSubtotal += storedTotal;
    } else {
      regularSubtotal += storedTotal;
      if (item.product?.qualifies_for_credit_earning) {
        creditEarningSubtotal += storedTotal;
      }
    }
  }

  const expectedEarned = creditEarningSubtotal * (pct / 100);
  const expectedUsed = Math.min(sfSubtotal, expectedEarned);
  const expectedTotal = regularSubtotal + Math.max(0, sfSubtotal - expectedEarned);

  const storedEarned = Number(args.orderCreditEarned) || 0;
  const storedUsed = Number(args.orderSupportFundUsed) || 0;
  const storedTotal = Number(args.orderTotalValue) || 0;

  if (Math.abs(storedEarned - expectedEarned) > EPSILON) {
    violations.push({
      field: 'credit_earned',
      sku: null,
      stored: storedEarned,
      expected: expectedEarned,
      detail:
        `credit_earned $${storedEarned.toFixed(2)} ≠ ${pct}% of qualifying subtotal ` +
        `$${creditEarningSubtotal.toFixed(2)} = $${expectedEarned.toFixed(2)}.`,
    });
  }
  if (Math.abs(storedUsed - expectedUsed) > EPSILON) {
    violations.push({
      field: 'support_fund_used',
      sku: null,
      stored: storedUsed,
      expected: expectedUsed,
      detail:
        `support_fund_used $${storedUsed.toFixed(2)} ≠ min(SF items $${sfSubtotal.toFixed(2)}, ` +
        `earned $${expectedEarned.toFixed(2)}) = $${expectedUsed.toFixed(2)}.`,
    });
  }
  if (Math.abs(storedTotal - expectedTotal) > EPSILON) {
    violations.push({
      field: 'total_value',
      sku: null,
      stored: storedTotal,
      expected: expectedTotal,
      detail:
        `total_value $${storedTotal.toFixed(2)} ≠ regular $${regularSubtotal.toFixed(2)} + ` +
        `SF top-up $${Math.max(0, sfSubtotal - expectedEarned).toFixed(2)} = $${expectedTotal.toFixed(2)}.`,
    });
  }

  return { ok: violations.length === 0, violations };
}
