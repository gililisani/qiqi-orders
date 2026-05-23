'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../components/admin/AdminFormShell';
import { FormField } from '../../../components/qq/form-field';
import { Input } from '../../../components/qq/input';
import { useToast } from '../../../components/ui/ToastProvider';

export default function NewPaymentTermPage() {
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
      const { error: insertError } = await supabase.from('payment_terms').insert([{
        name: name.trim(),
        description: description.trim() || null,
      }]);
      if (insertError) throw insertError;
      toast.success('Payment term created.');
      router.push('/admin/payment-terms');
    } catch (err: any) {
      setError(err.message || 'Failed to create payment term.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="New payment term"
      description="Payment term option assigned to companies."
      backHref="/admin/payment-terms"
      backLabel="Back to payment terms"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/payment-terms')}
      submitLabel="Create payment term"
    >
      <FormField label="Name" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Net 30, COD, Prepaid"
          autoFocus
          required
        />
      </FormField>
      <FormField label="Description">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional"
        />
      </FormField>
    </AdminFormShell>
  );
}
