import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * NetSuite item-map config. Item internal IDs that used to be hardcoded now
 * live in the `netsuite_item_map` table so they're editable (future mapping
 * page) and tenant-swappable. Read server-side only (service role).
 */
export type NetSuiteItemPurpose = 'shipping' | 'cc_processing_fee';

export interface NetSuiteMappedItem {
  purpose: NetSuiteItemPurpose;
  nsId: string;
  nsName: string | null;
  allowedOn: 'so_and_invoice' | 'invoice_only';
}

/**
 * Look up a mapped NetSuite item by purpose. Throws a clear, admin-readable
 * error if the row is missing (e.g. the migration hasn't been applied yet) so
 * callers surface "configure this in the mapping" rather than a null crash.
 */
export async function getNetSuiteItem(
  supabase: SupabaseClient,
  purpose: NetSuiteItemPurpose,
): Promise<NetSuiteMappedItem> {
  const { data, error } = await supabase
    .from('netsuite_item_map')
    .select('purpose, ns_id, ns_name, allowed_on')
    .eq('purpose', purpose)
    .single();

  if (error || !data) {
    throw new Error(
      `NetSuite item mapping for "${purpose}" is not configured. Add it in the NetSuite item map.`,
    );
  }

  return {
    purpose: data.purpose as NetSuiteItemPurpose,
    nsId: String(data.ns_id),
    nsName: data.ns_name ?? null,
    allowedOn: data.allowed_on as NetSuiteMappedItem['allowedOn'],
  };
}
