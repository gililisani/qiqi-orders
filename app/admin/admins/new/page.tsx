'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { AdminFormShell } from '../../../components/admin/AdminFormShell';
import { FormField } from '../../../components/qq/form-field';
import { Input } from '../../../components/qq/input';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { useToast } from '../../../components/ui/ToastProvider';

export default function NewAdminPage() {
  const router = useRouter();
  const toast = useToast();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onText = (key: 'name' | 'email') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/admin/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create admin.');
      toast.success('Admin created — they received an email to set their password.');
      router.push('/admin/admins');
    } catch (err: any) {
      setError(err.message || 'Failed to create admin.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="New admin"
      description="Qiqi staff member with full access to the admin portal."
      backHref="/admin/admins"
      backLabel="Back to admins"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/admins')}
      submitLabel="Create admin"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Full name" required>
          <Input value={formData.name} onChange={onText('name')} autoFocus required />
        </FormField>
        <FormField
          label="Email address"
          required
          helper="They'll receive an email with a secure link to set their own password (expires in 24 hours)."
        >
          <Input type="email" value={formData.email} onChange={onText('email')} required />
        </FormField>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={formData.enabled}
          onChange={(e) => setFormData((p) => ({ ...p, enabled: e.target.checked }))}
          className="h-4 w-4 accent-foreground"
        />
        <span className="text-sm text-foreground">Admin is enabled</span>
      </label>

      <Alert variant="warning">
        <AlertDescription>
          This admin will have full access to the system — they can manage all companies,
          users, products, and orders. The email must be unique across the entire system.
          You can disable the admin later.
        </AlertDescription>
      </Alert>
    </AdminFormShell>
  );
}
