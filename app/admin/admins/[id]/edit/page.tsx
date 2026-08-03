'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { supabase } from '../../../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../../../lib/fetchWithAuth';
import { AdminFormShell } from '../../../../components/admin/AdminFormShell';
import { FormField } from '../../../../components/qq/form-field';
import { Input } from '../../../../components/qq/input';
import { Button } from '../../../../components/qq/button';
import { useToast } from '../../../../components/ui/ToastProvider';
import { useConfirm } from '../../../../components/ui/ConfirmProvider';
import { PermissionsField } from '../../../../components/admin/PermissionsField';
import { DEFAULT_ADMIN_PERMISSIONS } from '../../../../../lib/permissions';

export default function EditAdminPage() {
  const router = useRouter();
  const params = useParams();
  const adminId = params?.id as string;
  const toast = useToast();
  const confirm = useConfirm();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    enabled: true,
    mfa_required: false,
    changePassword: false,
    newPassword: '',
    permissions: [...DEFAULT_ADMIN_PERMISSIONS] as string[],
  });
  const [originalEmail, setOriginalEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!adminId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('admins')
          .select('*')
          .eq('id', adminId)
          .single();
        if (error) throw error;
        setFormData({
          name: data?.name || '',
          email: data?.email || '',
          enabled: !!data?.enabled,
          mfa_required: !!data?.mfa_required,
          changePassword: false,
          newPassword: '',
          // Show EXACTLY what's stored — pre-checking defaults on an empty
          // array silently re-grants permissions on the next save.
          permissions: Array.isArray(data?.permissions) ? data.permissions : [],
        });
        setOriginalEmail(data?.email || '');
      } catch (err: any) {
        setError(err.message || 'Failed to load admin.');
      } finally {
        setLoading(false);
      }
    })();
  }, [adminId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) {
      setError('Name and email are required.');
      return;
    }
    if (formData.changePassword && formData.newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Server-side route: updates the profile row AND the auth record
      // (email/password) with checked errors. The old browser-side
      // auth.admin calls always failed silently.
      const res = await fetchWithAuth(`/api/users/${adminId}/account`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'admin',
          name: formData.name.trim(),
          email: formData.email.trim(),
          enabled: formData.enabled,
          mfa_required: formData.mfa_required,
          permissions: formData.permissions,
          ...(formData.changePassword && formData.newPassword
            ? { password: formData.newPassword }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update admin.');

      toast.success('Admin updated.');
      router.push('/admin/admins');
    } catch (err: any) {
      setError(err.message || 'Failed to update admin.');
    } finally {
      setSaving(false);
    }
  };

  // Lost-phone recovery: wipe the target's MFA factors so they can sign in
  // with password only and re-enroll at /admin/security.
  const handleResetMfa = async () => {
    const ok = await confirm({
      title: 'Reset two-factor authentication?',
      description:
        'Removes this admin’s authenticator enrollment. They sign in with password only until they re-enroll under their Security page.',
      variant: 'danger',
      confirmLabel: 'Reset two-factor',
    });
    if (!ok) return;
    try {
      const res = await fetchWithAuth(`/api/users/${adminId}/mfa`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to reset two-factor.');
      toast.success(
        data.removed > 0
          ? 'Two-factor reset. They can re-enroll at sign-in.'
          : 'This admin has no two-factor enrollment.',
      );
    } catch (err: any) {
      setError(err.message || 'Failed to reset two-factor.');
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete admin?',
      description: 'This permanently removes the admin and revokes their access. This cannot be undone.',
      variant: 'danger',
      confirmLabel: 'Delete admin',
      requireExplicitConfirm: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/api/users/${adminId}/account?kind=admin`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete admin.');
      toast.success('Admin deleted.');
      router.push('/admin/admins');
    } catch (err: any) {
      setError(err.message || 'Failed to delete admin.');
      setDeleting(false);
    }
  };

  return (
    <AdminFormShell
      title="Edit admin"
      width="wide"
      backHref="/admin/admins"
      backLabel="Back to admins"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/admins')}
      submitLabel="Save changes"
      headerActions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetMfa}
            disabled={deleting || saving}
          >
            Reset two-factor
          </Button>
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
        </>
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

      <FormField
        label="Access"
        helper="Which areas of the Hub this admin can manage. Default is everything; untick to restrict."
      >
        <PermissionsField
          value={formData.permissions}
          onChange={(next) => setFormData((p) => ({ ...p, permissions: next }))}
          disabled={loading}
        />
      </FormField>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={formData.enabled}
          onChange={(e) => setFormData((p) => ({ ...p, enabled: e.target.checked }))}
          disabled={loading}
          className="h-4 w-4 accent-foreground"
        />
        <span className="text-sm">Admin is enabled</span>
      </label>

      <div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={formData.mfa_required}
            onChange={(e) => setFormData((p) => ({ ...p, mfa_required: e.target.checked }))}
            disabled={loading}
            className="h-4 w-4 accent-foreground"
          />
          <span className="text-sm">Require two-factor authentication</span>
        </label>
        <p className="mt-1 ml-6 text-xs text-muted-foreground">
          Until they enroll, this admin is taken to the Security page at sign-in and
          cannot use other admin pages.
        </p>
      </div>

      <div className="space-y-3 pt-2 border-t border-border">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={formData.changePassword}
            onChange={(e) =>
              setFormData((p) => ({ ...p, changePassword: e.target.checked, newPassword: '' }))
            }
            disabled={loading}
            className="h-4 w-4 accent-foreground"
          />
          <span className="text-sm font-medium">Change password</span>
        </label>

        {formData.changePassword && (
          <FormField label="New password" required helper="Minimum 6 characters.">
            <Input
              type="password"
              value={formData.newPassword}
              onChange={(e) => setFormData((p) => ({ ...p, newPassword: e.target.value }))}
              minLength={6}
              required
            />
          </FormField>
        )}
      </div>
    </AdminFormShell>
  );
}
