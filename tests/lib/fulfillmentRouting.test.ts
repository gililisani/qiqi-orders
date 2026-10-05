import { describe, it, expect } from 'vitest';
import {
  resolveFulfillmentRoute,
  allowedWarehouses,
  toSettings,
  toSubsidiary,
  toWarehouse,
  type RoutingWarehouse,
} from '@/lib/fulfillmentRouting';

// A two-subsidiary tenant: "Parent" owns the 3PL, "US" owns no active warehouse.
const PARENT = 'sub-parent';
const US = 'sub-us';
const W = {
  threePl: { id: 'w-3pl', name: '3PL Parent', netsuiteId: '46', subsidiaryId: PARENT, active: true },
  oldUs: { id: 'w-old-us', name: 'Old US', netsuiteId: '31', subsidiaryId: US, active: false },
  usLocal: { id: 'w-us', name: 'US Local', netsuiteId: '50', subsidiaryId: US, active: true },
  noNs: { id: 'w-nons', name: 'No NS id', netsuiteId: null, subsidiaryId: PARENT, active: true },
  orphan: { id: 'w-orphan', name: 'Orphan', netsuiteId: '60', subsidiaryId: null, active: true },
} satisfies Record<string, RoutingWarehouse>;
const byId = new Map(Object.values(W).map((w) => [w.id, w]));
const sub = (id: string, ships: string | null) => ({ id, name: id === US ? 'US Inc' : 'Parent Ltd', fulfillmentLocationId: ships });
const ON = { crossSubsidiaryEnabled: true, customerOverridesEnabled: false };
const OFF = { crossSubsidiaryEnabled: false, customerOverridesEnabled: false };

describe('resolveFulfillmentRoute', () => {
  it('same-subsidiary default → not cross-subsidiary', () => {
    const r = resolveFulfillmentRoute({ settings: OFF, subsidiary: sub(PARENT, W.threePl.id), warehousesById: byId });
    expect(r).toMatchObject({ ok: true, crossSubsidiary: false, source: 'subsidiary' });
  });

  it("another subsidiary's warehouse → cross-subsidiary automatically when allowed", () => {
    const r = resolveFulfillmentRoute({ settings: ON, subsidiary: sub(US, W.threePl.id), warehousesById: byId });
    expect(r).toMatchObject({ ok: true, crossSubsidiary: true });
    if (r.ok) expect(r.warehouse.netsuiteId).toBe('46');
  });

  it('refuses cross-subsidiary when the tenant has it switched off', () => {
    const r = resolveFulfillmentRoute({ settings: OFF, subsidiary: sub(US, W.threePl.id), warehousesById: byId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cross-subsidiary fulfillment is switched off/);
  });

  it('never guesses: no ships-from, retired, missing NS id, no owner, missing customer subsidiary', () => {
    const cases = [
      { s: sub(US, null), re: /has no "Ships from" warehouse/ },
      { s: sub(US, W.oldUs.id), re: /is retired/ },
      { s: sub(PARENT, W.noNs.id), re: /has no NetSuite ID/ },
      { s: sub(PARENT, W.orphan.id), re: /has no owning subsidiary/ },
      { s: sub(PARENT, 'deleted'), re: /no longer exists/ },
    ];
    for (const c of cases) {
      const r = resolveFulfillmentRoute({ settings: ON, subsidiary: c.s, warehousesById: byId });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(c.re);
    }
    const none = resolveFulfillmentRoute({ settings: ON, subsidiary: null, warehousesById: byId });
    expect(none.ok).toBe(false);
  });

  it('customer exception wins only when exceptions are allowed', () => {
    const subUs = sub(US, W.threePl.id);
    const ignored = resolveFulfillmentRoute({ settings: ON, subsidiary: subUs, overrideLocationId: W.usLocal.id, warehousesById: byId });
    expect(ignored).toMatchObject({ ok: true, source: 'subsidiary', crossSubsidiary: true });
    const used = resolveFulfillmentRoute({
      settings: { ...ON, customerOverridesEnabled: true },
      subsidiary: subUs,
      overrideLocationId: W.usLocal.id,
      warehousesById: byId,
    });
    expect(used).toMatchObject({ ok: true, source: 'customer', crossSubsidiary: false });
    if (used.ok) expect(used.warehouse.id).toBe(W.usLocal.id);
  });

  it('a retired exception is an error, not a silent fallback', () => {
    const r = resolveFulfillmentRoute({
      settings: { ...ON, customerOverridesEnabled: true },
      subsidiary: sub(US, W.threePl.id),
      overrideLocationId: W.oldUs.id,
      warehousesById: byId,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/customer's warehouse exception.*|retired/);
  });
});

describe('allowedWarehouses', () => {
  const all = Object.values(W);
  it('own active warehouses only when cross-subsidiary is off', () => {
    expect(allowedWarehouses(OFF, US, all).map((w) => w.id)).toEqual([W.usLocal.id]);
  });
  it("adds other subsidiaries' active warehouses when on; never retired or ownerless", () => {
    expect(allowedWarehouses(ON, US, all).map((w) => w.id).sort()).toEqual(
      [W.threePl.id, W.usLocal.id, W.noNs.id].sort(),
    );
  });
});

describe('row mappers', () => {
  it('active defaults to true; settings default off', () => {
    expect(toWarehouse({ id: 1, location_name: 'X', netsuite_id: 9, subsidiary_id: 's' })).toMatchObject({
      id: '1', netsuiteId: '9', active: true,
    });
    expect(toWarehouse({ id: 2, active: false }).active).toBe(false);
    expect(toSettings(null)).toEqual({ crossSubsidiaryEnabled: false, customerOverridesEnabled: false });
    // fulfillment_routes one-to-one embed comes back as an object or a 1-element array
    expect(toSubsidiary({ id: 's', name: 'S', route: { location_id: 'w' } }).fulfillmentLocationId).toBe('w');
    expect(toSubsidiary({ id: 's', name: 'S', route: [{ location_id: 'w' }] }).fulfillmentLocationId).toBe('w');
    expect(toSubsidiary({ id: 's', name: 'S', route: null }).fulfillmentLocationId).toBeNull();
    expect(toSubsidiary({ id: 's', name: 'S', route: [] }).fulfillmentLocationId).toBeNull();
  });
});
