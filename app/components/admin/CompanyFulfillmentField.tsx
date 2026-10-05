'use client';

/**
 * Company new/edit: where this customer's orders ship from. Read-only result
 * of Settings → Fulfillment (the subsidiary's "ships from"); a per-customer
 * warehouse exception can be picked only when the tenant allows exceptions.
 */

import React from 'react';
import Link from 'next/link';
import { allowedWarehouses } from '../../../lib/fulfillmentRouting';
import { useFulfillmentRouting } from './useFulfillmentRouting';
import { Label } from '../qq/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../qq/select';

const NONE = '__none__';

export function CompanyFulfillmentField({
  subsidiaryId,
  overrideLocationId,
  onOverrideChange,
}: {
  subsidiaryId: string;
  overrideLocationId: string;
  onOverrideChange: (locationId: string) => void;
}) {
  const routing = useFulfillmentRouting();
  if (!routing.loaded) {
    return (
      <div>
        <Label className="text-sm font-medium">Ships from</Label>
        <p className="mt-1.5 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const subsidiary = routing.subsidiaries.find((s) => s.id === subsidiaryId) ?? null;
  const route = routing.resolve({
    subsidiary_id: subsidiaryId || null,
    fulfillment_location_override_id: overrideLocationId || null,
  });
  const defaultRoute = routing.resolve({ subsidiary_id: subsidiaryId || null });
  const ignoredOverride =
    !routing.settings.customerOverridesEnabled && overrideLocationId
      ? routing.warehouses.find((w) => w.id === overrideLocationId)?.name
      : null;

  return (
    <div className="space-y-2">
      <div>
        <Label className="text-sm font-medium">Ships from</Label>
        {!subsidiaryId ? (
          <p className="mt-1.5 text-sm text-amber-700">Choose a subsidiary first.</p>
        ) : route.ok ? (
          <p className="mt-1.5 text-sm">
            <span className="font-medium">{route.warehouse.name}</span>
            <span className="text-muted-foreground">
              {' '}
              · {route.source === 'customer' ? 'customer exception' : `${subsidiary?.name ?? 'subsidiary'} default`}
              {route.crossSubsidiary ? ' · cross-subsidiary' : ''}
            </span>
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-destructive">{route.error}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Set per subsidiary in{' '}
          <Link href="/admin/settings?tab=fulfillment" className="underline">
            Settings → Fulfillment
          </Link>
          .
          {ignoredOverride && ` This customer has an exception (${ignoredOverride}), ignored while exceptions are off.`}
        </p>
      </div>

      {routing.settings.customerOverridesEnabled && subsidiaryId && (
        <div>
          <Label className="text-sm font-medium">Warehouse exception</Label>
          <div className="mt-1.5">
            <Select
              value={overrideLocationId || NONE}
              onValueChange={(v) => onOverrideChange(v === NONE ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {`None — use the subsidiary default${defaultRoute.ok ? ` (${defaultRoute.warehouse.name})` : ''}`}
                </SelectItem>
                {allowedWarehouses(routing.settings, subsidiaryId, routing.warehouses).map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                    {w.subsidiaryId !== subsidiaryId
                      ? ` · ${routing.subsidiaries.find((s) => s.id === w.subsidiaryId)?.name ?? 'other subsidiary'}`
                      : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}
