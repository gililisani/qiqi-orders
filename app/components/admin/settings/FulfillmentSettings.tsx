'use client';

/**
 * Settings → Fulfillment: where each subsidiary's orders ship from, whether
 * cross-subsidiary fulfillment is allowed, and whether individual customers
 * may have a warehouse exception. Server-validated (/api/settings/fulfillment):
 * a change can never break routing for a customer that works today.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import {
  allowedWarehouses,
  type FulfillmentSettings as Settings,
  type RoutingWarehouse,
} from '../../../../lib/fulfillmentRouting';

import { Card, CardContent, CardHeader, CardTitle } from '../../qq/card';
import { Button } from '../../qq/button';
import { Badge } from '../../qq/badge';
import { Alert, AlertDescription } from '../../qq/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../qq/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../qq/table';
import { useToast } from '../../ui/ToastProvider';

interface SubsidiaryRow {
  id: string;
  name: string;
  netsuiteId: string | null;
  fulfillmentLocationId: string | null;
  customerCount: number;
}

interface StatePayload {
  settings: Settings;
  subsidiaries: SubsidiaryRow[];
  warehouses: RoutingWarehouse[];
  exceptions: Array<{ companyId: string; companyName: string; warehouseName: string }>;
}

const NONE = '__none__';

export function FulfillmentSettings() {
  const toast = useToast();
  const [data, setData] = useState<StatePayload | null>(null);
  const [settings, setSettings] = useState<Settings>({ crossSubsidiaryEnabled: false, customerOverridesEnabled: false });
  const [routes, setRoutes] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/settings/fulfillment');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load settings.');
      setData(json);
      setSettings(json.settings);
      setRoutes(Object.fromEntries(json.subsidiaries.map((s: SubsidiaryRow) => [s.id, s.fulfillmentLocationId])));
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const warehousesById = useMemo(
    () => new Map((data?.warehouses ?? []).map((w) => [w.id, w])),
    [data],
  );
  const subsidiaryName = (id: string | null) => data?.subsidiaries.find((s) => s.id === id)?.name ?? '—';
  const multiSubsidiary = (data?.subsidiaries.length ?? 0) > 1;

  const dirty =
    !!data &&
    (settings.crossSubsidiaryEnabled !== data.settings.crossSubsidiaryEnabled ||
      settings.customerOverridesEnabled !== data.settings.customerOverridesEnabled ||
      data.subsidiaries.some((s) => (routes[s.id] ?? null) !== (s.fulfillmentLocationId ?? null)));

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    setProblems([]);
    try {
      const res = await fetchWithAuth('/api/settings/fulfillment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          routes: data.subsidiaries.map((s) => ({ subsidiaryId: s.id, locationId: routes[s.id] ?? null })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblems(json.problems ?? []);
        throw new Error(json.error || 'Failed to save.');
      }
      setWarnings(json.warnings ?? []);
      toast.success('Fulfillment settings saved.');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground py-6">Loading fulfillment settings…</p>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            {problems.length > 0 && (
              <ul className="mt-2 list-disc pl-5 space-y-0.5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}
      {warnings.length > 0 && !error && (
        <Alert>
          <AlertDescription>
            Saved. These customers still have no valid warehouse — their orders can&apos;t be pushed to
            NetSuite until this is set:
            <ul className="mt-2 list-disc pl-5 space-y-0.5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {data && (
        <>
          {/* ---- Switches ---- */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Routing options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5 text-sm">
              {multiSubsidiary ? (
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-input"
                    checked={settings.crossSubsidiaryEnabled}
                    onChange={(e) => setSettings((s) => ({ ...s, crossSubsidiaryEnabled: e.target.checked }))}
                  />
                  <span>
                    <span className="font-medium">Cross-subsidiary fulfillment</span>
                    <span className="block text-muted-foreground mt-0.5">
                      Let a subsidiary ship from a warehouse owned by another subsidiary. Those orders are
                      sent to NetSuite as cross-subsidiary automatically — there is nothing to set per
                      customer. Requires the matching NetSuite feature: Setup → Company → Enable Features →
                      Items &amp; Inventory → Cross-Subsidiary Fulfillment.
                    </span>
                  </span>
                </label>
              ) : (
                <p className="text-muted-foreground">
                  Cross-subsidiary fulfillment doesn&apos;t apply — the Hub knows one subsidiary.
                </p>
              )}
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-input"
                  checked={settings.customerOverridesEnabled}
                  onChange={(e) => setSettings((s) => ({ ...s, customerOverridesEnabled: e.target.checked }))}
                />
                <span>
                  <span className="font-medium">Allow per-customer warehouse exceptions</span>
                  <span className="block text-muted-foreground mt-0.5">
                    Off: every customer ships from its subsidiary&apos;s warehouse below. On: a customer can be
                    given a different warehouse on its edit page (e.g. export customers served from another
                    location).
                    {data.exceptions.length > 0 && (
                      <>
                        {' '}
                        {data.exceptions.length} customer{data.exceptions.length === 1 ? ' has an exception' : 's have exceptions'}
                        {settings.customerOverridesEnabled ? '' : ' (ignored while this is off)'}:{' '}
                        {data.exceptions.map((x) => `${x.companyName} → ${x.warehouseName}`).join(', ')}.
                      </>
                    )}
                  </span>
                </span>
              </label>
            </CardContent>
          </Card>

          {/* ---- Ships from, per subsidiary ---- */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Ships from</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subsidiary</TableHead>
                    <TableHead>Ships from</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead className="text-right">Customers</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.subsidiaries.map((s) => {
                    const options = allowedWarehouses(settings, s.id, data.warehouses);
                    const chosenId = routes[s.id] ?? null;
                    const chosen = chosenId ? warehousesById.get(chosenId) : undefined;
                    const chosenAllowed = !!chosen && options.some((o) => o.id === chosen.id);
                    const cross = !!chosen && chosen.subsidiaryId !== s.id;
                    return (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm font-medium">{s.name}</TableCell>
                        <TableCell className="min-w-[260px]">
                          <Select
                            value={chosenId ?? NONE}
                            onValueChange={(v) => setRoutes((r) => ({ ...r, [s.id]: v === NONE ? null : v }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>— Not set —</SelectItem>
                              {chosen && !chosenAllowed && (
                                <SelectItem value={chosen.id}>
                                  {chosen.name} (not allowed — {chosen.active ? 'other subsidiary' : 'retired'})
                                </SelectItem>
                              )}
                              {options.map((w) => (
                                <SelectItem key={w.id} value={w.id}>
                                  {w.name}
                                  {w.subsidiaryId !== s.id ? ` · ${subsidiaryName(w.subsidiaryId)}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {!chosen ? (
                            <Badge variant={s.customerCount > 0 ? 'destructive' : 'muted'}>Not set</Badge>
                          ) : !chosenAllowed ? (
                            <Badge variant="destructive">Not allowed</Badge>
                          ) : cross ? (
                            <Badge variant="accent">Cross-subsidiary</Badge>
                          ) : (
                            <Badge variant="success">Own warehouse</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{s.customerCount}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="px-6 py-3 text-xs text-muted-foreground border-t border-border">
                Warehouses, their owning subsidiary and retired warehouses are managed on{' '}
                <Link href="/admin/netsuite-data?tab=locations" className="underline">
                  NetSuite Data → Locations
                </Link>
                . The NetSuite push uses these settings at the moment each order is pushed.
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={load} disabled={saving || !dirty}>
              Discard changes
            </Button>
            <Button onClick={save} loading={saving} disabled={!dirty}>
              Save fulfillment settings
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
