/**
 * Fulfillment routing — "which warehouse does this customer's order ship
 * from, and is that cross-subsidiary?" One answer for the whole Hub: order
 * save (snapshot), the NetSuite Sales Order push, and every screen that shows
 * a customer's warehouse.
 *
 * Tenant-agnostic by design (migration 20261006120000):
 *   1. A per-customer exception, when the tenant allows exceptions.
 *   2. Otherwise the customer's subsidiary default ("ships from").
 * Cross-subsidiary fulfillment is never chosen — it is the consequence of
 * shipping from a warehouse owned by another subsidiary, and is refused when
 * the tenant has the feature switched off. Nothing is guessed: any gap is an
 * error naming the setting to fix.
 */

export interface FulfillmentSettings {
  crossSubsidiaryEnabled: boolean;
  customerOverridesEnabled: boolean;
}

export interface RoutingWarehouse {
  id: string;
  name: string;
  netsuiteId: string | null;
  subsidiaryId: string | null;
  active: boolean;
}

export interface RoutingSubsidiary {
  id: string;
  name: string;
  fulfillmentLocationId: string | null;
}

export type FulfillmentRoute =
  | {
      ok: true;
      warehouse: RoutingWarehouse;
      crossSubsidiary: boolean;
      source: 'customer' | 'subsidiary';
    }
  | { ok: false; error: string };

export const DEFAULT_FULFILLMENT_SETTINGS: FulfillmentSettings = {
  crossSubsidiaryEnabled: false,
  customerOverridesEnabled: false,
};

export function resolveFulfillmentRoute(args: {
  settings: FulfillmentSettings;
  subsidiary: RoutingSubsidiary | null;
  overrideLocationId?: string | null;
  warehousesById: Map<string, RoutingWarehouse>;
}): FulfillmentRoute {
  const { settings, subsidiary, warehousesById } = args;
  if (!subsidiary) {
    return { ok: false, error: 'The customer has no subsidiary set — edit the customer and choose one.' };
  }

  const override = settings.customerOverridesEnabled ? args.overrideLocationId ?? null : null;
  const source: 'customer' | 'subsidiary' = override ? 'customer' : 'subsidiary';
  const locationId = override ?? subsidiary.fulfillmentLocationId;
  if (!locationId) {
    return {
      ok: false,
      error: `${subsidiary.name} has no "Ships from" warehouse. Set it in Settings → Fulfillment.`,
    };
  }

  const where = source === 'customer' ? "the customer's warehouse exception" : `${subsidiary.name}'s "Ships from" warehouse`;
  const warehouse = warehousesById.get(locationId);
  if (!warehouse) {
    return { ok: false, error: `${where} no longer exists. Choose another in Settings → Fulfillment.` };
  }
  if (!warehouse.active) {
    return {
      ok: false,
      error: `${warehouse.name} (${where}) is retired. Choose an active warehouse in Settings → Fulfillment.`,
    };
  }
  if (!warehouse.netsuiteId) {
    return {
      ok: false,
      error: `${warehouse.name} has no NetSuite ID. Add it on NetSuite Data → Locations.`,
    };
  }
  if (!warehouse.subsidiaryId) {
    return {
      ok: false,
      error: `${warehouse.name} has no owning subsidiary. Set it on NetSuite Data → Locations.`,
    };
  }

  const crossSubsidiary = warehouse.subsidiaryId !== subsidiary.id;
  if (crossSubsidiary && !settings.crossSubsidiaryEnabled) {
    return {
      ok: false,
      error:
        `${warehouse.name} belongs to another subsidiary, and cross-subsidiary fulfillment is ` +
        `switched off. Turn it on in Settings → Fulfillment, or ship ${subsidiary.name}'s orders ` +
        `from one of its own warehouses.`,
    };
  }

  return { ok: true, warehouse, crossSubsidiary, source };
}

/**
 * Warehouses a subsidiary (or one of its customers) may ship from under the
 * current settings: active ones it owns, plus — with cross-subsidiary
 * fulfillment on — active ones owned by other subsidiaries.
 */
export function allowedWarehouses(
  settings: FulfillmentSettings,
  subsidiaryId: string,
  warehouses: RoutingWarehouse[],
): RoutingWarehouse[] {
  return warehouses.filter(
    (w) =>
      w.active &&
      !!w.subsidiaryId &&
      (w.subsidiaryId === subsidiaryId || settings.crossSubsidiaryEnabled),
  );
}

// ---- Row mappers (DB shape → routing shape) ----

/** PostgREST returns a one-to-one embed as an object (or a 1-element array). */
function one<T>(x: T | T[] | null | undefined): T | null {
  return Array.isArray(x) ? (x[0] ?? null) : (x ?? null);
}

/** Embed for a subsidiary's route: `route:fulfillment_routes(location_id)`. */
export const SUBSIDIARY_ROUTE_EMBED = 'route:fulfillment_routes(location_id)';

export function toWarehouse(row: any): RoutingWarehouse {
  return {
    id: String(row.id),
    name: row.location_name ?? 'Unnamed warehouse',
    netsuiteId: row.netsuite_id ? String(row.netsuite_id) : null,
    subsidiaryId: row.subsidiary_id ?? null,
    active: row.active !== false,
  };
}

export function toSubsidiary(row: any): RoutingSubsidiary {
  return {
    id: String(row.id),
    name: row.name ?? 'Unnamed subsidiary',
    fulfillmentLocationId: one<any>(row.route)?.location_id ?? null,
  };
}

export function toSettings(row: any): FulfillmentSettings {
  if (!row) return DEFAULT_FULFILLMENT_SETTINGS;
  return {
    crossSubsidiaryEnabled: !!row.cross_subsidiary_enabled,
    customerOverridesEnabled: !!row.customer_overrides_enabled,
  };
}

/**
 * Server-side: resolve a company's route from the database. Works with any
 * Supabase client that can read the tables (service role on the server, an
 * admin session in the browser).
 */
export async function loadFulfillmentRoute(
  supabase: any,
  companyId: string,
): Promise<FulfillmentRoute & { subsidiaryNetsuiteId?: string | null; warehouseSubsidiaryNetsuiteId?: string | null }> {
  const [settingsRes, companyRes, overrideRes] = await Promise.all([
    supabase.from('fulfillment_settings').select('*').eq('id', 1).maybeSingle(),
    supabase
      .from('companies')
      .select(`id, subsidiary:subsidiaries(id, name, netsuite_id, ${SUBSIDIARY_ROUTE_EMBED})`)
      .eq('id', companyId)
      .maybeSingle(),
    supabase.from('fulfillment_customer_overrides').select('location_id').eq('company_id', companyId).maybeSingle(),
  ]);
  if (settingsRes.error) throw new Error(`fulfillment settings: ${settingsRes.error.message}`);
  if (companyRes.error) throw new Error(`company lookup: ${companyRes.error.message}`);
  if (overrideRes.error) throw new Error(`customer exception lookup: ${overrideRes.error.message}`);
  if (!companyRes.data) return { ok: false, error: 'Customer not found.' };

  const subRaw: any = one(companyRes.data.subsidiary);
  const subsidiary = subRaw ? toSubsidiary(subRaw) : null;
  const overrideLocationId: string | null = overrideRes.data?.location_id ?? null;
  const settings = toSettings(settingsRes.data);
  const ids = [overrideLocationId, subsidiary?.fulfillmentLocationId].filter(Boolean);
  const warehousesById = new Map<string, RoutingWarehouse>();
  const subsidiaryNsByWarehouse = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: rows, error } = await supabase
      .from('Locations')
      .select('id, location_name, netsuite_id, subsidiary_id, active, subsidiary:subsidiaries(netsuite_id)')
      .in('id', ids);
    if (error) throw new Error(`warehouse lookup: ${error.message}`);
    for (const r of rows ?? []) {
      warehousesById.set(String(r.id), toWarehouse(r));
      const s: any = one(r.subsidiary);
      subsidiaryNsByWarehouse.set(String(r.id), s?.netsuite_id ? String(s.netsuite_id) : null);
    }
  }

  const route = resolveFulfillmentRoute({ settings, subsidiary, overrideLocationId, warehousesById });
  if (!route.ok) return route;
  return {
    ...route,
    subsidiaryNetsuiteId: subRaw?.netsuite_id ? String(subRaw.netsuite_id) : null,
    warehouseSubsidiaryNetsuiteId: subsidiaryNsByWarehouse.get(route.warehouse.id) ?? null,
  };
}
