'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../../components/admin/AdminFormShell';
import { FormField } from '../../../../components/qq/form-field';
import { Input } from '../../../../components/qq/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/qq/select';
import { useToast } from '../../../../components/ui/ToastProvider';

interface Subsidiary {
  id: string;
  name: string;
}

export default function EditLocationPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const toast = useToast();

  const [locationName, setLocationName] = useState('');
  const [country, setCountry] = useState('');
  const [netsuiteId, setNetsuiteId] = useState('');
  const [subsidiaryId, setSubsidiaryId] = useState<string>('');
  const [active, setActive] = useState(true);
  const [wasActive, setWasActive] = useState(true);
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [locRes, subsRes] = await Promise.all([
          supabase
            .from('Locations')
            .select('location_name, country, netsuite_id, subsidiary_id, active')
            .eq('id', id)
            .single(),
          supabase.from('subsidiaries').select('id, name').order('name'),
        ]);
        if (locRes.error) throw locRes.error;
        if (subsRes.error) throw subsRes.error;
        setLocationName(locRes.data?.location_name || '');
        setCountry(locRes.data?.country || '');
        setNetsuiteId(locRes.data?.netsuite_id || '');
        setSubsidiaryId(locRes.data?.subsidiary_id || '');
        setActive(locRes.data?.active !== false);
        setWasActive(locRes.data?.active !== false);
        setSubsidiaries(subsRes.data || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load location.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationName.trim()) {
      setError('Location name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Retiring a warehouse that orders still route to would strand them —
      // move the routing first (Settings → Fulfillment / the customer page).
      if (wasActive && !active) {
        const [subsUsing, companiesUsing] = await Promise.all([
          supabase.from('fulfillment_routes').select('subsidiary:subsidiaries(name)').eq('location_id', id),
          supabase
            .from('fulfillment_customer_overrides')
            .select('company:companies(company_name)')
            .eq('location_id', id),
        ]);
        const first = (x: any) => (Array.isArray(x) ? x[0] : x);
        const subNames = (subsUsing.data ?? []).map((r: any) => first(r.subsidiary)?.name ?? 'a subsidiary');
        const coNames = (companiesUsing.data ?? []).map((r: any) => first(r.company)?.company_name ?? 'a customer');
        if (subNames.length > 0 || coNames.length > 0) {
          setError(
            'This warehouse is still in use and can\'t be retired yet. ' +
              (subNames.length > 0 ? `"Ships from" for: ${subNames.join(', ')} (change it in Settings → Fulfillment). ` : '') +
              (coNames.length > 0 ? `Warehouse exception for: ${coNames.join(', ')} (change it on each customer).` : ''),
          );
          return;
        }
      }
      const { error: updateError } = await supabase
        .from('Locations')
        .update({
          location_name: locationName.trim(),
          country: country.trim() || null,
          netsuite_id: netsuiteId.trim() || null,
          subsidiary_id: subsidiaryId || null,
          active,
        })
        .eq('id', id);
      if (updateError) throw updateError;
      toast.success('Location updated.');
      router.push('/admin/netsuite-data?tab=locations');
    } catch (err: any) {
      setError(err.message || 'Failed to update location.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="Edit location"
      backHref="/admin/netsuite-data?tab=locations"
      backLabel="Back to locations"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/netsuite-data?tab=locations')}
      submitLabel="Save changes"
    >
      {loading ? (
        <p className="text-sm text-muted-foreground py-4">Loading…</p>
      ) : (
        <>
      <FormField label="Location name" required>
        <Input
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          disabled={loading}
          required
          autoFocus
        />
      </FormField>
      <FormField label="Country">
        <Input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          disabled={loading}
        />
      </FormField>
      <FormField
        label="Subsidiary"
        helper="Which subsidiary owns the inventory at this location. A subsidiary shipping from another subsidiary's warehouse is cross-subsidiary fulfillment (Settings → Fulfillment)."
      >
        <Select
          value={subsidiaryId}
          onValueChange={setSubsidiaryId}
          disabled={loading}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a subsidiary…" />
          </SelectTrigger>
          <SelectContent>
            {subsidiaries.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-input"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          disabled={loading}
        />
        <span>
          <span className="font-medium">Active</span>
          <span className="block text-muted-foreground mt-0.5">
            Untick to retire a warehouse you no longer ship from. Retired warehouses disappear from
            every warehouse choice but stay on past orders.
          </span>
        </span>
      </label>
      <FormField
        label="NetSuite Internal ID"
        helper="From Setup → Company → Locations, Internal ID column."
      >
        <Input
          value={netsuiteId}
          onChange={(e) => setNetsuiteId(e.target.value)}
          disabled={loading}
          placeholder="e.g. 5"
        />
      </FormField>
        </>
      )}
    </AdminFormShell>
  );
}
