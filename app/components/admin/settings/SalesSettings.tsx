'use client';

/**
 * Settings → Sales: what counts as sales in the sales ledger (mirrored from
 * NetSuite billing), how far back history goes, and the sync status per
 * company. Hub catalog products always count; prefixes add items outside
 * the catalog (e.g. discontinued versions); everything that is neither a
 * product nor a discount (shipping, fees, services…) is excluded.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { formatDateTime } from '../../../../lib/formatters';

import { Card, CardContent, CardHeader, CardTitle } from '../../qq/card';
import { Button } from '../../qq/button';
import { Badge } from '../../qq/badge';
import { Input } from '../../qq/input';
import { FormField } from '../../qq/form-field';
import { Alert, AlertDescription } from '../../qq/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../qq/table';
import { useToast } from '../../ui/ToastProvider';

interface CompanyStatus {
  id: string;
  name: string;
  linked: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  documentCount: number;
}

interface StatePayload {
  rule: { historyStartDate: string | null; productSkuPrefixes: string[]; discountItemNames: string[] };
  netsuiteConfigured: boolean;
  companies: CompanyStatus[];
}

const toList = (text: string) =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function SalesSettings() {
  const toast = useToast();
  const [data, setData] = useState<StatePayload | null>(null);
  const [startDate, setStartDate] = useState('');
  const [prefixes, setPrefixes] = useState('');
  const [discounts, setDiscounts] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (json: StatePayload) => {
    setData(json);
    setStartDate(json.rule.historyStartDate ?? '');
    setPrefixes(json.rule.productSkuPrefixes.join(', '));
    setDiscounts(json.rule.discountItemNames.join(', '));
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/settings/sales');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load sales settings.');
      apply(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty =
    !!data &&
    (startDate !== (data.rule.historyStartDate ?? '') ||
      toList(prefixes).join(',') !== data.rule.productSkuPrefixes.join(',') ||
      toList(discounts).join(',') !== data.rule.discountItemNames.join(','));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/settings/sales', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historyStartDate: startDate || null,
          productSkuPrefixes: toList(prefixes),
          discountItemNames: toList(discounts),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to save.');
      apply(json);
      toast.success('Sales settings saved. They apply from the next sync.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const syncAll = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/sales-ledger/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Sync failed.');
      const s = json.summary;
      toast.success(`Synced ${s.companies} companies · ${s.documents} documents${s.errors.length ? ` · ${s.errors.length} failed` : ''}.`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  if (loading && !data) {
    return <p className="text-sm text-muted-foreground py-6">Loading sales settings…</p>;
  }

  const linked = data?.companies.filter((c) => c.linked) ?? [];
  const failing = linked.filter((c) => c.lastError);

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">What counts as sales</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sales come from NetSuite billing — every invoice, credit memo and cash sale of a linked customer, whether
            or not it started as a Hub order. A document counts at its total minus everything that is not a product or
            a discount (shipping, card fees and surcharges, services, other charges). Foreign-currency documents are
            converted to USD at the rate NetSuite recorded on the document.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 max-w-2xl">
          <FormField
            label="History starts"
            htmlFor="sales-start"
            helper="Documents dated before this are not imported. The sync stays off until this is set."
          >
            <Input id="sales-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField
            label="Product families that count toward sales"
            htmlFor="sales-prefixes"
            helper="SKU prefixes, comma-separated. Items whose SKU starts with one of these count toward sales and targets, as does every product in the Hub catalog. Anything else on an invoice — shipping, fees, other items — doesn't count. Discounts reduce sales automatically."
          >
            <Input id="sales-prefixes" value={prefixes} onChange={(e) => setPrefixes(e.target.value)} placeholder="FPS, KIT, TOL" />
          </FormField>
          <FormField
            label="Other items that reduce a sale (optional)"
            htmlFor="sales-discounts"
            helper="Comma-separated NetSuite item names. Only needed for items that work as discounts but aren't set up as discount items in NetSuite."
          >
            <Input id="sales-discounts" value={discounts} onChange={(e) => setDiscounts(e.target.value)} placeholder="Customer Discount" />
          </FormField>
          <div className="flex gap-2">
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {dirty && (
              <Button variant="outline" onClick={() => data && apply(data)} disabled={saving}>
                Discard
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-sm">Sync</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Runs every night. Read-only towards NetSuite.
              {failing.length > 0 && <span className="text-amber-700"> {failing.length} companies failed last time.</span>}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={syncAll}
            disabled={syncing || !data?.netsuiteConfigured || !data?.rule.historyStartDate || dirty}
            title={!data?.netsuiteConfigured ? 'NetSuite is not configured in this environment.' : undefined}
          >
            {syncing ? 'Syncing…' : 'Sync all now'}
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {!data?.netsuiteConfigured && (
            <p className="text-sm text-muted-foreground px-6 pb-4">NetSuite is not configured in this environment.</p>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead className="text-right">Documents</TableHead>
                <TableHead>Last synced</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.companies ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm font-medium">
                    <Link href={`/admin/companies/${c.id}/sales`} className="hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{c.linked ? c.documentCount : '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.lastSyncedAt ? formatDateTime(c.lastSyncedAt) : '—'}</TableCell>
                  <TableCell>
                    {!c.linked ? (
                      <Badge variant="muted">No NetSuite customer ID</Badge>
                    ) : c.lastError ? (
                      <Badge variant="destructive" title={c.lastError}>
                        Failed
                      </Badge>
                    ) : c.lastSyncedAt ? (
                      <Badge variant="success">Synced</Badge>
                    ) : (
                      <Badge variant="muted">Not synced yet</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
