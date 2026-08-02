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
 *   unit price   = class name contains "america" (tolerant, case-insensitive)
 *                  → price_americas, else price_international
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

export interface PricingItemInput {
  quantity: number | null;
  unit_price: number | string | null;
  total_price: number | string | null;
  is_support_fund_item: boolean | null;
  product: {
    sku: string | null;
    price_americas: number | string | null;
    price_international: number | string | null;
    qualifies_for_credit_earning: boolean | null;
  } | null;
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

/** Mirror of the forms' getProductPrice — tolerant substring match on the
 *  class name (never strict-equal against domain text; see 2026-05-28). */
export function resolveCatalogPrice(
  companyClassName: string | null | undefined,
  product: { price_americas: number | string | null; price_international: number | string | null },
): number {
  const className = (companyClassName || '').toLowerCase();
  if (className.includes('america')) return Number(product.price_americas) || 0;
  return Number(product.price_international) || 0;
}

export function validateOrderPricing(args: {
  items: PricingItemInput[];
  companyClassName: string | null | undefined;
  /** Company's support-fund tier percent; 0 / null when not enrolled. */
  supportFundPercent: number | null | undefined;
  orderTotalValue: number | string | null;
  orderCreditEarned: number | string | null;
  orderSupportFundUsed: number | string | null;
}): OrderPricingResult {
  const violations: PricingViolation[] = [];
  const pct = Number(args.supportFundPercent) || 0;

  let regularSubtotal = 0;
  let creditEarningSubtotal = 0;
  let sfSubtotal = 0;

  for (const item of args.items) {
    const sku = item.product?.sku ?? null;
    const qty = Number(item.quantity) || 0;
    const storedUnit = Number(item.unit_price) || 0;
    const storedTotal = Number(item.total_price) || 0;

    if (item.product) {
      const catalogUnit = resolveCatalogPrice(args.companyClassName, item.product);
      if (Math.abs(storedUnit - catalogUnit) > EPSILON) {
        violations.push({
          field: 'unit_price',
          sku,
          stored: storedUnit,
          expected: catalogUnit,
          detail:
            `${sku ?? 'item'}: stored unit price $${storedUnit.toFixed(2)} ≠ catalog ` +
            `$${catalogUnit.toFixed(2)}. Either the order was tampered with or the product's ` +
            `catalog price changed after the order was created.`,
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
