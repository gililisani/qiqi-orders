'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../components/admin/AdminFormShell';
import { FormField } from '../../../components/qq/form-field';
import { Input } from '../../../components/qq/input';
import { useToast } from '../../../components/ui/ToastProvider';

export default function NewClassPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('classes').insert([{ name: name.trim() }]);
      if (insertError) throw insertError;
      toast.success('Class created.');
      router.push('/admin/classes');
    } catch (err: any) {
      setError(err.message || 'Failed to create class.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="New class"
      description="NetSuite class for order classification."
      backHref="/admin/classes"
      backLabel="Back to classes"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/classes')}
      submitLabel="Create class"
    >
      <FormField label="Name" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sales"
          autoFocus
          required
        />
      </FormField>
    </AdminFormShell>
  );
}
