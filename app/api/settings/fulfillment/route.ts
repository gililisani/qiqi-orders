import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import {
  SUBSIDIARY_ROUTE_EMBED,
  allowedWarehouses,
  resolveFulfillmentRoute,
  toSettings,
  toSubsidiary,
  toWarehouse,
  type FulfillmentSettings,
  type RoutingWarehouse,
} from '../../../../lib/fulfillmentRouting';

/**
 * Settings → Fulfillment.
 *
 * GET  (config:view) — switches, warehouses, each subsidiary's "ships from"
 *       with its resolved routing, customer counts and exceptions.
 * PUT  (config:edit) — { crossSubsidiaryEnabled, customerOverridesEnabled,
 *       routes: [{ subsidiaryId, locationId | null }] }. Validated as a whole:
 *       a change that would break routing for any customer who routes fine
 *       today is refused with the reasons. Customers still unroutable (a
 *       tenant configuring step by step) come back as warnings.
 */

interface RoutableCompanyRow {
  id: string;
  company_name: string;
  subsidiary_id: string | null;
  fulfillment_location_override_id: string | null;
}

async function loadState(supabase: any) {
  const [settingsRes, subsRes, whRes, companiesRes, overridesRes] = await Promise.all([
    supabase.from('fulfillment_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('subsidiaries').select(`id, name, netsuite_id, ${SUBSIDIARY_ROUTE_EMBED}`).order('name'),
    supabase.from('Locations').select('id, location_name, netsuite_id, subsidiary_id, active').order('location_name'),
    supabase.from('companies').select('id, company_name, subsidiary_id'),
    supabase.from('fulfillment_customer_overrides').select('company_id, location_id'),
  ]);
  for (const r of [settingsRes, subsRes, whRes, companiesRes, overridesRes]) {
    if (r.error) throw new Error(r.error.message);
  }
  const overrideByCompany = new Map<string, string>(
    (overridesRes.data ?? []).map((o: any) => [String(o.company_id), String(o.location_id)]),
  );
  return {
    settings: toSettings(settingsRes.data),
    subsidiaries: (subsRes.data ?? []).map((s: any) => ({ ...toSubsidiary(s), netsuiteId: s.netsuite_id ?? null })),
    warehouses: (whRes.data ?? []).map(toWarehouse) as RoutingWarehouse[],
    companies: ((companiesRes.data ?? []) as any[]).map((c): RoutableCompanyRow => ({
      id: String(c.id),
      company_name: c.company_name as string,
      subsidiary_id: (c.subsidiary_id as string | null) ?? null,
      fulfillment_location_override_id: overrideByCompany.get(String(c.id)) ?? null,
    })),
  };
}

/** Every customer's route under a configuration; unroutable ones by company id. */
function checkCustomers(
  state: Awaited<ReturnType<typeof loadState>>,
  settings: FulfillmentSettings,
  routeBySubsidiary: Map<string, string | null>,
) {
  const warehousesById = new Map(state.warehouses.map((w) => [w.id, w]));
  const problems = new Map<string, string>();
  for (const c of state.companies) {
    const sub = state.subsidiaries.find((s: any) => s.id === c.subsidiary_id) ?? null;
    const route = resolveFulfillmentRoute({
      settings,
      subsidiary: sub ? { ...sub, fulfillmentLocationId: routeBySubsidiary.get(sub.id) ?? null } : null,
      overrideLocationId: c.fulfillment_location_override_id,
      warehousesById,
    });
    if (!route.ok) problems.set(c.id, `${c.company_name}: ${route.error}`);
  }
  return problems;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'config:view');
    const supabase = createServiceRoleClient();
    const state = await loadState(supabase);
    const warehousesById = new Map(state.warehouses.map((w) => [w.id, w]));

    const subsidiaries = state.subsidiaries.map((s: any) => {
      const customers = state.companies.filter((c) => c.subsidiary_id === s.id);
      const route = resolveFulfillmentRoute({ settings: state.settings, subsidiary: s, warehousesById });
      return {
        id: s.id,
        name: s.name,
        netsuiteId: s.netsuiteId,
        fulfillmentLocationId: s.fulfillmentLocationId,
        customerCount: customers.length,
        route: route.ok
          ? { ok: true, warehouseName: route.warehouse.name, crossSubsidiary: route.crossSubsidiary }
          : { ok: false, error: route.error },
      };
    });

    const exceptions = state.companies
      .filter((c) => c.fulfillment_location_override_id)
      .map((c) => ({
        companyId: c.id,
        companyName: c.company_name,
        warehouseName: warehousesById.get(c.fulfillment_location_override_id!)?.name ?? 'Unknown warehouse',
      }));

    return NextResponse.json({
      settings: state.settings,
      subsidiaries,
      warehouses: state.warehouses,
      exceptions,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('GET /api/settings/fulfillment:', error);
    return NextResponse.json({ error: error.message || 'Failed to load settings.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAdminWithPermission(request, 'config:edit');
    const body = await request.json();
    const settings: FulfillmentSettings = {
      crossSubsidiaryEnabled: body.crossSubsidiaryEnabled === true,
      customerOverridesEnabled: body.customerOverridesEnabled === true,
    };
    const routes: Array<{ subsidiaryId: string; locationId: string | null }> = Array.isArray(body.routes)
      ? body.routes
      : [];

    const supabase = createServiceRoleClient();
    const state = await loadState(supabase);

    // Each submitted "ships from" must be a warehouse that subsidiary may use.
    const routeBySubsidiary = new Map<string, string | null>(
      state.subsidiaries.map((s: any) => [s.id, s.fulfillmentLocationId]),
    );
    for (const r of routes) {
      const sub = state.subsidiaries.find((s: any) => s.id === r.subsidiaryId);
      if (!sub) {
        return NextResponse.json({ error: 'Unknown subsidiary in the request.' }, { status: 400 });
      }
      const locationId = r.locationId || null;
      if (locationId) {
        const allowed = allowedWarehouses(settings, sub.id, state.warehouses);
        if (!allowed.some((w) => w.id === locationId)) {
          const w = state.warehouses.find((x) => x.id === locationId);
          return NextResponse.json(
            {
              error: !w
                ? `${sub.name}: unknown warehouse.`
                : !w.active
                  ? `${sub.name}: ${w.name} is retired.`
                  : `${sub.name}: ${w.name} belongs to another subsidiary — turn on cross-subsidiary fulfillment first.`,
            },
            { status: 400 },
          );
        }
      }
      routeBySubsidiary.set(sub.id, locationId);
    }

    // Whole-configuration check: never break a customer that routes today.
    const before = checkCustomers(
      state,
      state.settings,
      new Map(state.subsidiaries.map((s: any) => [s.id, s.fulfillmentLocationId])),
    );
    const after = checkCustomers(state, settings, routeBySubsidiary);
    const newlyBroken = [...after].filter(([id]) => !before.has(id)).map(([, msg]) => msg);
    if (newlyBroken.length > 0) {
      return NextResponse.json(
        {
          error:
            `This change would leave ${newlyBroken.length} customer${newlyBroken.length === 1 ? '' : 's'} ` +
            `without a valid warehouse — nothing was saved.`,
          problems: newlyBroken.slice(0, 20),
        },
        { status: 400 },
      );
    }

    const { error: settingsErr } = await supabase.from('fulfillment_settings').upsert({
      id: 1,
      cross_subsidiary_enabled: settings.crossSubsidiaryEnabled,
      customer_overrides_enabled: settings.customerOverridesEnabled,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    });
    if (settingsErr) throw new Error(`settings write: ${settingsErr.message}`);

    for (const [subsidiaryId, locationId] of routeBySubsidiary) {
      const before = state.subsidiaries.find((s: any) => s.id === subsidiaryId)?.fulfillmentLocationId ?? null;
      if (before === locationId) continue;
      const { error } = locationId
        ? await supabase.from('fulfillment_routes').upsert({
            subsidiary_id: subsidiaryId,
            location_id: locationId,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          })
        : await supabase.from('fulfillment_routes').delete().eq('subsidiary_id', subsidiaryId);
      if (error) throw new Error(`route write: ${error.message}`);
    }

    return NextResponse.json({ success: true, warnings: [...after.values()].slice(0, 20), unroutable: after.size });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('PUT /api/settings/fulfillment:', error);
    return NextResponse.json({ error: error.message || 'Failed to save settings.' }, { status: 500 });
  }
}
