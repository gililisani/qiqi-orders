'use client';

/**
 * Browser-side fulfillment routing for admin screens: loads the tenant's
 * switches, subsidiaries and warehouses once and resolves any company with
 * the same function the server uses (lib/fulfillmentRouting).
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import {
  DEFAULT_FULFILLMENT_SETTINGS,
  SUBSIDIARY_ROUTE_EMBED,
  resolveFulfillmentRoute,
  toSettings,
  toSubsidiary,
  toWarehouse,
  type FulfillmentRoute,
  type FulfillmentSettings,
  type RoutingSubsidiary,
  type RoutingWarehouse,
} from '../../../lib/fulfillmentRouting';

/** A company as screens know it. `id` finds its saved warehouse exception;
 *  pass `fulfillment_location_override_id` to preview an unsaved one. */
export interface RoutableCompany {
  id?: string | null;
  subsidiary_id?: string | null;
  fulfillment_location_override_id?: string | null;
}

export interface FulfillmentRoutingData {
  loaded: boolean;
  settings: FulfillmentSettings;
  subsidiaries: RoutingSubsidiary[];
  warehouses: RoutingWarehouse[];
  /** Saved per-customer exceptions: company id → warehouse id. */
  overrides: Map<string, string>;
  resolve: (company: RoutableCompany) => FulfillmentRoute;
  /** "Warehouse" / "Warehouse (cross-subsidiary)" / "Not set". */
  label: (company: RoutableCompany) => string;
}

export function useFulfillmentRouting(): FulfillmentRoutingData {
  const [loaded, setLoaded] = useState(false);
  const [settings, setSettings] = useState<FulfillmentSettings>(DEFAULT_FULFILLMENT_SETTINGS);
  const [subsidiaries, setSubsidiaries] = useState<RoutingSubsidiary[]>([]);
  const [warehouses, setWarehouses] = useState<RoutingWarehouse[]>([]);
  const [overrides, setOverrides] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, subs, wh, ov] = await Promise.all([
        supabase.from('fulfillment_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('subsidiaries').select(`id, name, ${SUBSIDIARY_ROUTE_EMBED}`).order('name'),
        supabase.from('Locations').select('id, location_name, netsuite_id, subsidiary_id, active').order('location_name'),
        supabase.from('fulfillment_customer_overrides').select('company_id, location_id'),
      ]);
      if (cancelled) return;
      setSettings(toSettings(s.data));
      setSubsidiaries((subs.data ?? []).map(toSubsidiary));
      setWarehouses((wh.data ?? []).map(toWarehouse));
      setOverrides(new Map((ov.data ?? []).map((o: any) => [String(o.company_id), String(o.location_id)])));
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const warehousesById = new Map(warehouses.map((w) => [w.id, w]));
    const resolve: FulfillmentRoutingData['resolve'] = (company) =>
      resolveFulfillmentRoute({
        settings,
        subsidiary: subsidiaries.find((s) => s.id === company.subsidiary_id) ?? null,
        overrideLocationId:
          company.fulfillment_location_override_id !== undefined
            ? company.fulfillment_location_override_id
            : company.id
              ? (overrides.get(company.id) ?? null)
              : null,
        warehousesById,
      });
    const label: FulfillmentRoutingData['label'] = (company) => {
      const r = resolve(company);
      if (!r.ok) return 'Not set';
      return `${r.warehouse.name}${r.crossSubsidiary ? ' (cross-subsidiary)' : ''}`;
    };
    return { loaded, settings, subsidiaries, warehouses, overrides, resolve, label };
  }, [loaded, settings, subsidiaries, warehouses, overrides]);
}
