/**
 * Replacements report (owner 2026-10-23): every Shopify replacement order
 * (tag "Replacement" / note "Replacement for #7369 – damaged"), the order it
 * replaces, the original order at the root of the chain (#7559 → #7507 →
 * #7369), why, its status and what it cost in goods — the evidence for
 * damage/loss claims with the carrier or the 3PL. Read-only.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReplacementRow {
  shopifyOrderId: string;
  orderName: string;
  createdAt: string;
  forOrder: string | null;
  /** The first order in the chain (e.g. #7369 for #7559). */
  rootOrder: string | null;
  reason: string | null;
  items: string[];
  status: 'shipped' | 'waiting' | 'cancelled' | 'error';
  nsFulfillmentIds: string[];
  nsTarget: string | null;
  /** Cost of goods posted by its shipment(s) in NetSuite (cents); null when not shipped or unknown. */
  costCents: number | null;
}

type DbRow = {
  shopify_order_id: string;
  order_name: string;
  order_created_at: string;
  state: string;
  skip_reason: string | null;
  ns_fulfillment_ids: string[] | null;
  ns_target: string | null;
  plan: { replacement?: { forOrder: string | null; reason: string | null } | null; lines?: Array<{ sku: string; quantity: number }> } | null;
};

/** Pure: shape DB rows into report rows and resolve each chain's root order. */
export function buildReplacementRows(rows: DbRow[], costs: Map<string, number> = new Map()): ReplacementRow[] {
  const forByName = new Map(rows.map((r) => [r.order_name, r.plan?.replacement?.forOrder ?? null]));
  const root = (name: string): string | null => {
    let current = forByName.get(name) ?? null;
    for (let hops = 0; current && forByName.get(current) && hops < 10; hops++) current = forByName.get(current)!;
    return current;
  };
  return rows.map((r) => {
    const ifs = r.ns_fulfillment_ids ?? [];
    const status: ReplacementRow['status'] =
      ifs.length > 0 ? 'shipped' : r.state === 'error' ? 'error' : r.state === 'cancelled' || r.skip_reason === 'ZERO_CANCELLED' ? 'cancelled' : 'waiting';
    const cost = ifs.reduce<number | null>((s, id) => (costs.has(id) ? (s ?? 0) + costs.get(id)! : s), null);
    return {
      shopifyOrderId: r.shopify_order_id,
      orderName: r.order_name,
      createdAt: r.order_created_at,
      forOrder: r.plan?.replacement?.forOrder ?? null,
      rootOrder: root(r.order_name),
      reason: r.plan?.replacement?.reason ?? null,
      items: (r.plan?.lines ?? []).map((l) => `${l.quantity} × ${l.sku}`),
      status,
      nsFulfillmentIds: ifs,
      nsTarget: r.ns_target,
      costCents: status === 'shipped' ? cost : null,
    };
  });
}

/**
 * Load the report. Costs come from the NetSuite `target` the sync writes to
 * now — only for rows booked there (sandbox ids would mean other records).
 * Without `suiteQL` costs stay empty.
 */
export async function loadReplacements(
  db: SupabaseClient,
  target: 'sandbox' | 'production',
  suiteQL?: (query: string) => Promise<Array<Record<string, unknown>>>,
): Promise<ReplacementRow[]> {
  const { data, error } = await db
    .from('shopify_order_sync')
    .select('shopify_order_id, order_name, order_created_at, state, skip_reason, ns_fulfillment_ids, ns_target, plan')
    .not('plan->>replacement', 'is', null)
    .order('order_created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DbRow[];

  const costs = new Map<string, number>();
  const ifIds = [
    ...new Set(rows.filter((r) => r.ns_target === target).flatMap((r) => r.ns_fulfillment_ids ?? [])),
  ].filter((id) => /^\d+$/.test(id));
  if (suiteQL && ifIds.length) {
    for (let i = 0; i < ifIds.length; i += 200) {
      const part = await suiteQL(
        `SELECT tal.transaction, SUM(tal.amount) AS amt FROM transactionaccountingline tal
           JOIN account a ON a.id = tal.account
          WHERE tal.transaction IN (${ifIds.slice(i, i + 200).join(',')})
            AND a.accttype = 'COGS' AND tal.posting = 'T' AND tal.accountingbook = 1
          GROUP BY tal.transaction`,
      );
      for (const r of part) costs.set(String(r.transaction), Math.round(Number(r.amt ?? 0) * 100));
    }
  }
  return buildReplacementRows(rows, costs);
}
