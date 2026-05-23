'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../../components/admin/AdminFormShell';
import { FormField } from '../../../../components/qq/form-field';
import { Input } from '../../../../components/qq/input';
import { useToast } from '../../../../components/ui/ToastProvider';

export default function EditLocationPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const toast = useToast();

  const [locationName, setLocationName] = useState('');
  const [country, setCountry] = useState('');
  const [netsuiteId, setNetsuiteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('Locations')
          .select('location_name, country, netsuite_id')
          .eq('id', id)
          .single();
        if (error) throw error;
        setLocationName(data?.location_name || '');
        setCountry(data?.country || '');
        setNetsuiteId(data?.netsuite_id || '');
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
      const { error: updateError } = await supabase
        .from('Locations')
        .update({
          location_name: locationName.trim(),
          country: country.trim() || null,
          netsuite_id: netsuiteId.trim() || null,
        })
        .eq('id', id);
      if (updateError) throw updateError;
      toast.success('Location updated.');
      router.push('/admin/locations');
    } catch (err: any) {
      setError(err.message || 'Failed to update location.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="Edit location"
      backHref="/admin/locations"
      backLabel="Back to locations"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/locations')}
      submitLabel="Save changes"
    >
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
    </AdminFormShell>
  );
}
