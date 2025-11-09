import { SLIDocumentData } from '../pdf/components/SLIDocument';

export type AggregatedProduct = {
  hs_code: string;
  total_quantity: number;
  total_weight: number;
  total_value: number;
  made_in: string;
};

export type SLIProduct = AggregatedProduct & {
  quantity: number;
  weight: number;
  value: number;
};

export type ProductAggregationInput = {
  products: Array<{
    hs_code?: string | null;
    quantity?: number | null;
    case_qty?: number | null;
    case_weight?: number | null;
    total_price?: number | null;
    made_in?: string | null;
    weight?: number | null;
  }>;
};

function getDorF(madeIn: string): 'D' | 'F' {
  const country = (madeIn || '').toLowerCase().trim();
  if (['usa', 'united states', 'us'].includes(country)) return 'D';
  return 'F';
}

export function aggregateProductsByHS({ products }: ProductAggregationInput) {
  const grouped = new Map<string, SLIProduct>();
  const withoutHS: SLIProduct[] = [];

  products.forEach((product) => {
    const hsRaw = (product.hs_code || '').trim();
    const hsCode = hsRaw !== '' ? hsRaw : 'N/A';

    const quantity = Number(product.quantity) || 0;
    const providedWeight = Number(product.weight);
    const caseQty = Number(product.case_qty) || 0;
    const caseWeight = Number(product.case_weight) || 0;
    const weight = !Number.isNaN(providedWeight) && providedWeight > 0
      ? providedWeight
      : caseQty * caseWeight;
    const value = Number(product.total_price) || 0;
    const madeIn = product.made_in || '';

    if (hsRaw) {
      if (grouped.has(hsCode)) {
        const existing = grouped.get(hsCode)!;
        existing.total_quantity += quantity;
        existing.quantity += quantity;
        existing.total_weight += weight;
        existing.weight += weight;
        existing.total_value += value;
        existing.value += value;
      } else {
        grouped.set(hsCode, {
          hs_code: hsCode,
          total_quantity: quantity,
          total_weight: weight,
          total_value: value,
          made_in: madeIn,
          quantity,
          weight,
          value,
        });
      }
    } else {
      withoutHS.push({
        hs_code: 'N/A',
        total_quantity: quantity,
        total_weight: weight,
        total_value: value,
        made_in: madeIn,
        quantity,
        weight,
        value,
      });
    }
  });

  return {
    productsWithHS: Array.from(grouped.values()),
    productsWithoutHS: withoutHS,
  };
}
