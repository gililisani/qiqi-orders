'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../../components/admin/AdminFormShell';
import { FormField } from '../../../../components/qq/form-field';
import { Input } from '../../../../components/qq/input';
import { useToast } from '../../../../components/ui/ToastProvider';

export default function EditSupportFundPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const toast = useToast();

  const [percent, setPercent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('support_fund_levels')
          .select('percent')
          .eq('id', id)
          .single();
        if (error) throw error;
        setPercent(data?.percent?.toString() || '');
      } catch (err: any) {
        setError(err.message || 'Failed to load support fund.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

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
      const { error: updateError } = await supabase
        .from('support_fund_levels')
        .update({ percent: n })
        .eq('id', id);
      if (updateError) throw updateError;
      toast.success('Support fund updated.');
      router.push('/admin/support-funds');
    } catch (err: any) {
      setError(err.message || 'Failed to update support fund.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="Edit support fund"
      backHref="/admin/support-funds"
      backLabel="Back to support funds"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/support-funds')}
      submitLabel="Save changes"
    >
      <FormField label="Percent" required helper="Whole number, e.g. 10 for 10%.">
        <Input
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          disabled={loading}
          required
          autoFocus
        />
      </FormField>
    </AdminFormShell>
  );
}
