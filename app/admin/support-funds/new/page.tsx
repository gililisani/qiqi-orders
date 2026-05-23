'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../components/admin/AdminFormShell';
import { FormField } from '../../../components/qq/form-field';
import { Input } from '../../../components/qq/input';
import { useToast } from '../../../components/ui/ToastProvider';

export default function NewSupportFundPage() {
  const router = useRouter();
  const toast = useToast();
  const [percent, setPercent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(percent);
    if (!percent || Number.isNaN(n) || n < 0 || n > 100) {
      setError('Percent must be a number between 0 and 100.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('support_fund_levels').insert([{ percent: n }]);
      if (insertError) throw insertError;
      toast.success('Support fund created.');
      router.push('/admin/support-funds');
    } catch (err: any) {
      setError(err.message || 'Failed to create support fund.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="New support fund"
      description="Percentage that companies can earn back as credit on eligible orders."
      backHref="/admin/support-funds"
      backLabel="Back to support funds"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/support-funds')}
      submitLabel="Create support fund"
    >
      <FormField label="Percent" required helper="Whole number, e.g. 10 for 10%.">
        <Input
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          placeholder="e.g. 10"
          autoFocus
          required
        />
      </FormField>
    </AdminFormShell>
  );
}
