'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../components/admin/AdminFormShell';
import { FormField } from '../../../components/qq/form-field';
import { Input } from '../../../components/qq/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/qq/select';
import { useToast } from '../../../components/ui/ToastProvider';

interface Subsidiary {
  id: string;
  name: string;
}

export default function NewLocationPage() {
  const router = useRouter();
  const toast = useToast();
  const [locationName, setLocationName] = useState('');
  const [country, setCountry] = useState('');
  const [netsuiteId, setNetsuiteId] = useState('');
  const [subsidiaryId, setSubsidiaryId] = useState<string>('');
  const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('subsidiaries')
      .select('id, name')
      .order('name')
      .then(({ data }) => setSubsidiaries(data || []));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locationName.trim()) {
      setError('Location name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('Locations').insert([
        {
          location_name: locationName.trim(),
          country: country.trim() || null,
          netsuite_id: netsuiteId.trim() || null,
          subsidiary_id: subsidiaryId || null,
        },
      ]);
      if (insertError) throw insertError;
      toast.success('Location created.');
      router.push('/admin/locations');
    } catch (err: any) {
      setError(err.message || 'Failed to create location.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="New location"
      description="Warehouse or stocking location used in NetSuite."
      backHref="/admin/locations"
      backLabel="Back to locations"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/locations')}
      submitLabel="Create location"
    >
      <FormField label="Location name" required>
        <Input
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          autoFocus
          required
        />
      </FormField>
      <FormField label="Country">
        <Input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="e.g. United States"
        />
      </FormField>
      <FormField
        label="Subsidiary"
        helper="Which subsidiary owns the inventory at this location. Drives cross-subsidiary fulfillment when a customer's subsidiary differs from this."
      >
        <Select value={subsidiaryId} onValueChange={setSubsidiaryId}>
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
      <FormField
        label="NetSuite Internal ID"
        helper="From Setup → Company → Locations, Internal ID column."
      >
        <Input
          value={netsuiteId}
          onChange={(e) => setNetsuiteId(e.target.value)}
          placeholder="e.g. 5"
        />
      </FormField>
    </AdminFormShell>
  );
}
