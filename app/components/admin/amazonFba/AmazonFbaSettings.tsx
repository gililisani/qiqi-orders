'use client';

/**
 * Settings card for the Amazon FBA import — the NetSuite internal IDs every
 * pushed record references. Most were seeded by migration; vendor + account
 * IDs can be auto-resolved (needs role permissions) or typed manually.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Wand2 } from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { Card, CardContent, CardHeader, CardTitle } from '../../qq/card';
import { Button } from '../../qq/button';
import { Input } from '../../qq/input';
import { FormField } from '../../qq/form-field';
import { useToast } from '../../ui/ToastProvider';

export interface AmazonFbaConfigRow {
  customer_ns_id: string;
  vendor_ns_id: string;
  subsidiary_ns_id: string;
  location_ns_id: string;
  currency_ns_id: string;
  class_name: string;
  bank_account_ns_id: string;
  platform_fees_account_ns_id: string;
  advertising_account_ns_id: string;
  writeoff_account_ns_id: string;
  refund_item_ns_id: string;
  discount_item_ns_id: string;
}

const FIELDS: { key: keyof AmazonFbaConfigRow; label: string; hint?: string }[] = [
  { key: 'customer_ns_id', label: 'Customer — C2847 Amazon' },
  { key: 'vendor_ns_id', label: 'Vendor — V5322 AMAZON', hint: 'Open the vendor in NetSuite; the id= number in the URL.' },
  { key: 'subsidiary_ns_id', label: 'Subsidiary — Qiqi INC' },
  { key: 'location_ns_id', label: 'Location — Amazon FBA' },
  { key: 'currency_ns_id', label: 'Currency — USD' },
  { key: 'class_name', label: 'Class (by name)' },
  { key: 'bank_account_ns_id', label: 'Account 100505 — Amazon QIQI INC (USD)' },
  { key: 'platform_fees_account_ns_id', label: 'Account 622040 — Amazon Platform Fees' },
  { key: 'advertising_account_ns_id', label: 'Account 630040 — Amazon Advertisement' },
  { key: 'writeoff_account_ns_id', label: 'Account 620070 — inventory write-off' },
  { key: 'refund_item_ns_id', label: 'Refund item — Refund Adjustment' },
];

interface DiscountItem { id: string; itemid: string }

export function AmazonFbaSettings({
  config,
  onConfigChange,
}: {
  config: AmazonFbaConfigRow;
  onConfigChange: (next: AmazonFbaConfigRow) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<AmazonFbaConfigRow>(config);
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [diagnostics, setDiagnostics] = useState<{ probe: string; ok: boolean; detail: string }[]>([]);
  const [discountItems, setDiscountItems] = useState<DiscountItem[]>([]);

  useEffect(() => setDraft(config), [config]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/netsuite/amazon-fba/item-search?type=discount');
        const data = await res.json();
        if (res.ok) setDiscountItems(data.items || []);
      } catch {
        // non-fatal — manual id entry still works
      }
    })();
  }, []);

  const set = (key: keyof AmazonFbaConfigRow) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((p) => ({ ...p, [key]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/netsuite/amazon-fba/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed to save.');
      onConfigChange(draft);
      toast.success('Amazon FBA settings saved.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  async function resolveFromNetSuite() {
    setResolving(true);
    setDiagnostics([]);
    try {
      const res = await fetchWithAuth('/api/netsuite/amazon-fba/config/resolve', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resolve failed.');
      setDiagnostics(data.diagnostics || []);
      if (data.config) {
        onConfigChange(data.config);
        setDraft(data.config);
      }
      const okCount = (data.diagnostics || []).filter((d: any) => d.ok).length;
      toast.success(`Resolve finished — ${okCount} lookup(s) succeeded.`);
    } catch (err: any) {
      toast.error(err.message || 'Resolve failed.');
    } finally {
      setResolving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">NetSuite IDs</CardTitle>
        <Button type="button" variant="outline" size="sm" onClick={resolveFromNetSuite} loading={resolving}>
          <Wand2 className="h-4 w-4" />
          Resolve from NetSuite
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {FIELDS.map((f) => (
            <FormField key={f.key} label={f.label}>
              <div className="flex items-center gap-2">
                <Input value={draft[f.key]} onChange={set(f.key)} placeholder={f.hint || 'Internal ID'} />
                {draft[f.key] ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive shrink-0" />
                )}
              </div>
            </FormField>
          ))}
          <FormField label="Discount item (promo rebates line)">
            <div className="flex items-center gap-2">
              <select
                value={draft.discount_item_ns_id}
                onChange={(e) => setDraft((p) => ({ ...p, discount_item_ns_id: e.target.value }))}
                className="w-full h-9 px-3 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— choose a discount item —</option>
                {discountItems.map((d) => (
                  <option key={d.id} value={d.id}>{d.itemid}</option>
                ))}
              </select>
              {draft.discount_item_ns_id ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
            </div>
          </FormField>
        </div>

        {diagnostics.length > 0 && (
          <div className="border border-border rounded-md p-3 space-y-2">
            {diagnostics.map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {d.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                )}
                <div>
                  <span className="font-medium">{d.probe}:</span>{' '}
                  <span className="text-muted-foreground">{d.detail}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button type="button" onClick={save} loading={saving}>
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
