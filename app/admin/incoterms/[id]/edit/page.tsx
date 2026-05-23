'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../../components/admin/AdminFormShell';
import { FormField } from '../../../../components/qq/form-field';
import { Input } from '../../../../components/qq/input';
import { useToast } from '../../../../components/ui/ToastProvider';

export default function EditIncotermPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const toast = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('incoterms')
          .select('name, description')
          .eq('id', id)
          .single();
        if (error) throw error;
        setName(data?.name || '');
        setDescription(data?.description || '');
      } catch (err: any) {
        setError(err.message || 'Failed to load incoterm.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('incoterms')
        .update({ name: name.trim(), description: description.trim() || null })
        .eq('id', id);
      if (updateError) throw updateError;
      toast.success('Incoterm updated.');
      router.push('/admin/incoterms');
    } catch (err: any) {
      setError(err.message || 'Failed to update incoterm.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="Edit incoterm"
      backHref="/admin/incoterms"
      backLabel="Back to incoterms"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/incoterms')}
      submitLabel="Save changes"
    >
      <FormField label="Name" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
          required
          autoFocus
        />
      </FormField>
      <FormField label="Description">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
        />
      </FormField>
    </AdminFormShell>
  );
}
