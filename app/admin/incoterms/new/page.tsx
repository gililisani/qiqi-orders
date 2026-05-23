'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../components/admin/AdminFormShell';
import { FormField } from '../../../components/qq/form-field';
import { Input } from '../../../components/qq/input';
import { useToast } from '../../../components/ui/ToastProvider';

export default function NewIncotermPage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
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
      const { error: insertError } = await supabase.from('incoterms').insert([{
        name: name.trim(),
        description: description.trim() || null,
      }]);
      if (insertError) throw insertError;
      toast.success('Incoterm created.');
      router.push('/admin/incoterms');
    } catch (err: any) {
      setError(err.message || 'Failed to create incoterm.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="New incoterm"
      description="International trade term used on shipping documents."
      backHref="/admin/incoterms"
      backLabel="Back to incoterms"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/incoterms')}
      submitLabel="Create incoterm"
    >
      <FormField label="Name" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. FOB, EXW, DDP"
          autoFocus
          required
        />
      </FormField>
      <FormField label="Description" helper="Short description of when this term applies.">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />
      </FormField>
    </AdminFormShell>
  );
}
