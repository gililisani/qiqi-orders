'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../../../../lib/fetchWithAuth';
import { AdminFormShell } from '../../../../../components/admin/AdminFormShell';
import { FormField } from '../../../../../components/qq/form-field';
import { Input } from '../../../../../components/qq/input';
import { Alert, AlertDescription } from '../../../../../components/qq/alert';
import { useToast } from '../../../../../components/ui/ToastProvider';

export default function NewCompanyUserPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params?.id as string;
  const toast = useToast();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    enabled: true,
  });
  const [companyName, setCompanyName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const { data } = await supabase
        .from('companies')
        .select('company_name')
        .eq('id', companyId)
        .single();
      setCompanyName(data?.company_name || '');
    })();
  }, [companyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.trim(),
          companyId,
          enabled: formData.enabled,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create user.');
      toast.success('User created. A password setup email has been sent.');
      router.push(`/admin/companies/${companyId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="New user"
      description={companyName ? `Add a user under ${companyName}.` : undefined}
      backHref={`/admin/companies/${companyId}`}
      backLabel="Back to company"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push(`/admin/companies/${companyId}`)}
      submitLabel="Create user"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Full name" required>
          <Input
            value={formData.name}
            onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
            autoFocus
            required
          />
        </FormField>
        <FormField label="Email address" required>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
            required
          />
        </FormField>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={formData.enabled}
          onChange={(e) => setFormData((p) => ({ ...p, enabled: e.target.checked }))}
          className="h-4 w-4 accent-foreground"
        />
        <span className="text-sm">User is enabled</span>
      </label>

      <Alert variant="info">
        <AlertDescription>
          A password setup email will be sent automatically. The link is valid for 24 hours.
        </AlertDescription>
      </Alert>
    </AdminFormShell>
  );
}
