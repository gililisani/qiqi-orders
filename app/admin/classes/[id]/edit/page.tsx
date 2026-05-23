'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../../components/admin/AdminFormShell';
import { FormField } from '../../../../components/qq/form-field';
import { Input } from '../../../../components/qq/input';
import { useToast } from '../../../../components/ui/ToastProvider';

export default function EditClassPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const toast = useToast();

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error } = await supabase.from('classes').select('name').eq('id', id).single();
        if (error) throw error;
        setName(data?.name || '');
      } catch (err: any) {
        setError(err.message || 'Failed to load class.');
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
        .from('classes')
        .update({ name: name.trim() })
        .eq('id', id);
      if (updateError) throw updateError;
      toast.success('Class updated.');
      router.push('/admin/classes');
    } catch (err: any) {
      setError(err.message || 'Failed to update class.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="Edit class"
      backHref="/admin/classes"
      backLabel="Back to classes"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/classes')}
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
    </AdminFormShell>
  );
}
