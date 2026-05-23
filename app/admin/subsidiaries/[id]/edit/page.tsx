'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../../components/admin/AdminFormShell';
import { FormField } from '../../../../components/qq/form-field';
import { Input } from '../../../../components/qq/input';
import { Label } from '../../../../components/qq/label';
import { useToast } from '../../../../components/ui/ToastProvider';

export default function EditSubsidiaryPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const toast = useToast();

  const [formData, setFormData] = useState({
    name: '',
    netsuite_id: '',
    ship_from_address: '',
    company_address: '',
    phone: '',
    email: '',
    footer_text: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChange = (key: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData((p) => ({ ...p, [key]: e.target.value }));

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('subsidiaries')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        setFormData({
          name: data?.name || '',
          netsuite_id: data?.netsuite_id || '',
          ship_from_address: data?.ship_from_address || '',
          company_address: data?.company_address || '',
          phone: data?.phone || '',
          email: data?.email || '',
          footer_text: data?.footer_text || '',
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load subsidiary.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Subsidiary name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('subsidiaries')
        .update({
          name: formData.name.trim(),
          netsuite_id: formData.netsuite_id.trim() || null,
          ship_from_address: formData.ship_from_address.trim(),
          company_address: formData.company_address.trim(),
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          footer_text: formData.footer_text.trim() || null,
        })
        .eq('id', id);
      if (updateError) throw updateError;
      toast.success('Subsidiary updated.');
      router.push('/admin/subsidiaries');
    } catch (err: any) {
      setError(err.message || 'Failed to update subsidiary.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="Edit subsidiary"
      backHref="/admin/subsidiaries"
      backLabel="Back to subsidiaries"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/subsidiaries')}
      submitLabel="Save changes"
    >
      <FormField label="Subsidiary name" required>
        <Input
          value={formData.name}
          onChange={onChange('name')}
          disabled={loading}
          required
          autoFocus
        />
      </FormField>

      <FormField
        label="NetSuite Internal ID"
        helper="From Setup → Company → Subsidiaries, Internal ID column."
      >
        <Input
          value={formData.netsuite_id}
          onChange={onChange('netsuite_id')}
          disabled={loading}
          placeholder="e.g. 3"
        />
      </FormField>

      <div>
        <Label className="text-sm font-medium">Ship From address</Label>
        <textarea
          value={formData.ship_from_address}
          onChange={onChange('ship_from_address')}
          rows={3}
          disabled={loading}
          className="mt-1.5 w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:bg-secondary"
        />
      </div>

      <div>
        <Label className="text-sm font-medium">Company address</Label>
        <textarea
          value={formData.company_address}
          onChange={onChange('company_address')}
          rows={3}
          disabled={loading}
          className="mt-1.5 w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:bg-secondary"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Phone">
          <Input type="tel" value={formData.phone} onChange={onChange('phone')} disabled={loading} />
        </FormField>
        <FormField label="Email">
          <Input type="email" value={formData.email} onChange={onChange('email')} disabled={loading} />
        </FormField>
      </div>

      <div>
        <Label className="text-sm font-medium">Footer text</Label>
        <textarea
          value={formData.footer_text}
          onChange={onChange('footer_text')}
          rows={2}
          disabled={loading}
          placeholder="Optional text shown on packing slips"
          className="mt-1.5 w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:bg-secondary"
        />
      </div>
    </AdminFormShell>
  );
}
