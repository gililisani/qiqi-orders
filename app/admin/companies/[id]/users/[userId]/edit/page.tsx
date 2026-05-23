'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trash2, Mail } from 'lucide-react';

import { supabase } from '../../../../../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../../../../../lib/fetchWithAuth';
import { AdminFormShell } from '../../../../../../components/admin/AdminFormShell';
import { FormField } from '../../../../../../components/qq/form-field';
import { Input } from '../../../../../../components/qq/input';
import { Button } from '../../../../../../components/qq/button';
import { useToast } from '../../../../../../components/ui/ToastProvider';
import { useConfirm } from '../../../../../../components/ui/ConfirmProvider';

export default function EditCompanyUserPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params?.id as string;
  const userId = params?.userId as string;
  const toast = useToast();
  const confirm = useConfirm();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    enabled: true,
  });
  const [originalEmail, setOriginalEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resendingLink, setResendingLink] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !companyId) return;
    (async () => {
      try {
        const [userRes, companyRes] = await Promise.all([
          supabase
            .from('clients')
            .select('*')
            .eq('id', userId)
            .eq('company_id', companyId)
            .single(),
          supabase.from('companies').select('company_name').eq('id', companyId).single(),
        ]);
        if (userRes.error) throw userRes.error;
        const u = userRes.data;
        setFormData({
          name: u?.name || '',
          email: u?.email || '',
          enabled: !!u?.enabled,
        });
        setOriginalEmail(u?.email || '');
        setCompanyName(companyRes.data?.company_name || '');
      } catch (err: any) {
        setError(err.message || 'Failed to load user.');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId, companyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: profileError } = await supabase
        .from('clients')
        .update({
          name: formData.name.trim(),
          email: formData.email.trim(),
          enabled: formData.enabled,
        })
        .eq('id', userId);
      if (profileError) throw profileError;

      if (formData.email !== originalEmail) {
        await supabase.auth.admin.updateUserById(userId, {
          email: formData.email.trim(),
          user_metadata: { full_name: formData.name.trim() },
        });
      }
      toast.success('User updated.');
      router.push(`/admin/companies/${companyId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  };

  const handleSendResetLink = async () => {
    setResendingLink(true);
    try {
      const res = await fetchWithAuth('/api/users/send-reset-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          userEmail: formData.email,
          userName: formData.name,
          companyId,
          companyName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send link.');
      toast.success(
        data.isNewUser
          ? 'Password setup link sent.'
          : 'Password reset link sent.'
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to send link.');
    } finally {
      setResendingLink(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete user?',
      description: `Permanently delete ${formData.name || formData.email}. This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete user',
      requireExplicitConfirm: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth('/api/users/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user.');
      toast.success('User deleted.');
      router.push(`/admin/companies/${companyId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to delete user.');
      setDeleting(false);
    }
  };

  return (
    <AdminFormShell
      title="Edit user"
      description={companyName ? `Under ${companyName}.` : undefined}
      backHref={`/admin/companies/${companyId}`}
      backLabel="Back to company"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push(`/admin/companies/${companyId}`)}
      submitLabel="Save changes"
      headerActions={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={deleting || saving}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Full name" required>
          <Input
            value={formData.name}
            onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
            disabled={loading}
            required
            autoFocus
          />
        </FormField>
        <FormField label="Email address" required>
          <Input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
            disabled={loading}
            required
          />
        </FormField>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={formData.enabled}
          onChange={(e) => setFormData((p) => ({ ...p, enabled: e.target.checked }))}
          disabled={loading}
          className="h-4 w-4 accent-foreground"
        />
        <span className="text-sm">User is enabled</span>
      </label>

      <div className="pt-3 border-t border-border">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSendResetLink}
          loading={resendingLink}
          disabled={loading || saving}
        >
          <Mail className="h-4 w-4" />
          {resendingLink ? 'Sending…' : 'Send password setup/reset email'}
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          Sends a fresh password link to <span className="font-medium">{formData.email}</span>.
          Valid for 24 hours.
        </p>
      </div>
    </AdminFormShell>
  );
}
