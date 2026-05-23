'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { AdminFormShell } from '../../../components/admin/AdminFormShell';
import { FormField } from '../../../components/qq/form-field';
import { Input } from '../../../components/qq/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/qq/select';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { useToast } from '../../../components/ui/ToastProvider';

interface Company {
  id: string;
  company_name: string;
  netsuite_number: string;
}

export default function NewUserPage() {
  const router = useRouter();
  const toast = useToast();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    enabled: true,
    company_id: '',
  });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name, netsuite_number')
        .order('company_name');
      if (error) {
        setError(error.message);
        return;
      }
      setCompanies(data || []);
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.company_id) {
      setError('Name, email, and company are all required.');
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
          companyId: formData.company_id,
          enabled: formData.enabled,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create user.');
      toast.success('User created. A password setup email has been sent.');
      router.push('/admin/users');
    } catch (err: any) {
      setError(err.message || 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="New user"
      description="Add a client user with access to the partner portal."
      backHref="/admin/users"
      backLabel="Back to users"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/users')}
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

      <FormField label="Company" required>
        <Select
          value={formData.company_id || undefined}
          onValueChange={(v) => setFormData((p) => ({ ...p, company_id: v }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a company…" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.company_name}
                {c.netsuite_number && (
                  <span className="text-muted-foreground"> · {c.netsuite_number}</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

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
          No temporary password needed — the user picks their own.
        </AlertDescription>
      </Alert>
    </AdminFormShell>
  );
}
