'use client';

/**
 * Admin detail view — the landing page when clicking an admin in the list
 * (Edit is one click deeper). Rebuilt 2026-08 on the qq design system:
 * the old version used legacy components, a broken container, and a
 * HARDCODED "Full Access" permissions card that became misleading once
 * permissions were actually enforced. This one shows the real grants.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, Edit, X } from 'lucide-react';

import { supabase } from '../../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/qq/card';
import { Button } from '../../../components/qq/button';
import { Badge } from '../../../components/qq/badge';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { Label } from '../../../components/qq/label';
import { useToast } from '../../../components/ui/ToastProvider';
import { ADMIN_PERMISSION_GROUPS } from '../../../../lib/permissions';

interface Admin {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  created_at: string;
  permissions: string[] | null;
  mfa_required?: boolean;
}

export default function AdminViewPage() {
  const params = useParams();
  const adminId = params?.id as string;
  const toast = useToast();

  const [admin, setAdmin] = useState<Admin | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = still loading (the status comes from a service-role API,
  // not the admins row).
  const [mfaEnrolled, setMfaEnrolled] = useState<boolean | null>(null);

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
        setAdmin(data as Admin);
      } catch (err: any) {
        setError(err.message || 'Failed to load admin.');
      } finally {
        setLoading(false);
      }
    })();
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/users/${adminId}/mfa`);
        const data = await res.json().catch(() => ({}));
        if (res.ok) setMfaEnrolled(!!data.enrolled);
      } catch {
        /* leave as unknown */
      }
    })();
  }, [adminId]);

  const handleToggleEnabled = async () => {
    if (!admin) return;
    setToggling(true);
    try {
      // Through the account API: checked errors + you can't disable yourself.
      const res = await fetchWithAuth(`/api/users/${admin.id}/account`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'admin', enabled: !admin.enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update admin.');
      setAdmin((prev) => (prev ? { ...prev, enabled: !prev.enabled } : prev));
      toast.success(`Admin ${admin.enabled ? 'disabled' : 'enabled'}.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update admin.');
    } finally {
      setToggling(false);
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading admin…</p>
      </div>
    );
  }

  if (error || !admin) {
    return (
      <div className="px-6 py-8">
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error || 'Admin not found.'}</AlertDescription>
        </Alert>
        <Link href="/admin/admins">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Back to admins
          </Button>
        </Link>
      </div>
    );
  }

  const grants = Array.isArray(admin.permissions) ? admin.permissions : [];

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link
          href="/admin/admins"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to admins
        </Link>
      </div>

      <PageHeader
        title={admin.name || admin.email}
        description={admin.email}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleEnabled}
              loading={toggling}
            >
              {admin.enabled ? 'Disable admin' : 'Enable admin'}
            </Button>
            <Link href={`/admin/admins/${admin.id}/edit`}>
              <Button size="sm">
                <Edit className="h-4 w-4" /> Edit admin
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Admin details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ViewField label="Full name" value={admin.name || '—'} />
            <ViewField label="Email" value={admin.email} mono />
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block">
                Status
              </Label>
              <div className="mt-1">
                {admin.enabled ? (
                  <Badge variant="success">Enabled</Badge>
                ) : (
                  <Badge variant="muted">Disabled</Badge>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block">
                Two-factor authentication
              </Label>
              <div className="mt-1 flex items-center gap-2">
                {mfaEnrolled === null ? (
                  <span className="text-sm text-muted-foreground">…</span>
                ) : mfaEnrolled ? (
                  <Badge variant="success">Enrolled</Badge>
                ) : (
                  <Badge variant="muted">Not enrolled</Badge>
                )}
                {admin.mfa_required && <Badge variant="outline">Required</Badge>}
              </div>
            </div>
            <ViewField label="Admin ID" value={admin.id} mono />
            <ViewField
              label="Created"
              value={new Date(admin.created_at).toLocaleDateString()}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {ADMIN_PERMISSION_GROUPS.map((g) => {
              const label = g.single
                ? grants.includes(g.single)
                  ? 'Enabled'
                  : 'Off'
                : grants.includes(g.edit!)
                  ? 'View + Edit'
                  : grants.includes(g.view!)
                    ? 'View only'
                    : 'Off';
              const any = label !== 'Off';
              return (
                <div key={g.category} className="flex items-center justify-between gap-3">
                  <span className={any ? '' : 'text-muted-foreground'}>{g.category}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className={`text-xs ${any ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {label}
                    </span>
                    {any ? (
                      <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </span>
                </div>
              );
            })}
            <p className="pt-2 text-xs text-muted-foreground border-t border-border">
              Access is enforced on pages and APIs. Change grants via Edit admin.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ViewField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block">
        {label}
      </Label>
      <p className={`mt-1 text-sm ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
