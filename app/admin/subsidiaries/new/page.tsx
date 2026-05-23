'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../components/admin/AdminFormShell';
import { FormField } from '../../../components/qq/form-field';
import { Input } from '../../../components/qq/input';
import { Label } from '../../../components/qq/label';
import { useToast } from '../../../components/ui/ToastProvider';

export default function NewSubsidiaryPage() {
  const router = useRouter();
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChange = (key: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Subsidiary name is required.');
      return;
    }
    if (!formData.ship_from_address.trim()) {
      setError('Ship From address is required.');
      return;
    }
    if (!formData.company_address.trim()) {
      setError('Company address is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('subsidiaries').insert([{
        name: formData.name.trim(),
        netsuite_id: formData.netsuite_id.trim() || null,
        ship_from_address: formData.ship_from_address.trim(),
        company_address: formData.company_address.trim(),
        phone: formData.phone.trim() || null,
        email: formData.email.trim() || null,
        footer_text: formData.footer_text.trim() || null,
      }]);
      if (insertError) throw insertError;
      toast.success('Subsidiary created.');
      router.push('/admin/subsidiaries');
    } catch (err: any) {
      setError(err.message || 'Failed to create subsidiary.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="New subsidiary"
      description="Qiqi legal entity used for order routing in NetSuite."
      backHref="/admin/subsidiaries"
      backLabel="Back to subsidiaries"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/subsidiaries')}
      submitLabel="Create subsidiary"
    >
      <FormField label="Subsidiary name" required>
        <Input value={formData.name} onChange={onChange('name')} autoFocus required />
      </FormField>

      <FormField
        label="NetSuite Internal ID"
        helper="From Setup → Company → Subsidiaries, Internal ID column."
      >
        <Input value={formData.netsuite_id} onChange={onChange('netsuite_id')} placeholder="e.g. 3" />
      </FormField>

      <div>
        <Label className="text-sm font-medium">Ship From address *</Label>
        <textarea
          value={formData.ship_from_address}
          onChange={onChange('ship_from_address')}
          rows={3}
          required
          placeholder="Full shipping address for this subsidiary"
          className="mt-1.5 w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />
      </div>

      <div>
        <Label className="text-sm font-medium">Company address *</Label>
        <textarea
          value={formData.company_address}
          onChange={onChange('company_address')}
          rows={3}
          required
          placeholder="Legal company address"
          className="mt-1.5 w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Phone">
          <Input type="tel" value={formData.phone} onChange={onChange('phone')} />
        </FormField>
        <FormField label="Email">
          <Input type="email" value={formData.email} onChange={onChange('email')} />
        </FormField>
      </div>

      <div>
        <Label className="text-sm font-medium">Footer text</Label>
        <textarea
          value={formData.footer_text}
          onChange={onChange('footer_text')}
          rows={2}
          placeholder="Optional text shown on packing slips"
          className="mt-1.5 w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />
      </div>
    </AdminFormShell>
  );
}
