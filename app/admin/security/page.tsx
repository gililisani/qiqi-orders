'use client';

/**
 * /admin/security — self-service two-factor authentication (TOTP).
 * Reachable by every admin regardless of permission set (route guard
 * special-cases it). Enroll: QR + 6-digit confirm. Disable: aal2 required
 * (the layout gate guarantees an enrolled admin on this page is verified).
 */

import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { MFA_MAX_AGE_DAYS, verifyMfaCode } from '../../../lib/mfa';
import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { Alert, AlertDescription } from '../../components/qq/alert';
import { Badge } from '../../components/qq/badge';
import { useToast } from '../../components/ui/ToastProvider';
import { useConfirm } from '../../components/ui/ConfirmProvider';

type View = 'loading' | 'disabled' | 'enrolling' | 'enabled';

export default function AdminSecurityPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [view, setView] = useState<View>('loading');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const loadStatus = async () => {
    const { data, error: err } = await supabase.auth.mfa.listFactors();
    if (err) {
      setError(err.message);
      setView('disabled');
      return;
    }
    const verified = data?.totp?.find((f) => f.status === 'verified');
    setFactorId(verified?.id ?? null);
    setView(verified ? 'enabled' : 'disabled');
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartEnroll = async () => {
    setBusy(true);
    setError(null);
    try {
      // Clear leftovers from abandoned enrollments — Supabase refuses a new
      // factor while an unverified one with the same name exists.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.all ?? []) {
        if (f.status === 'unverified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }

      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Authenticator app',
      });
      if (err) throw err;
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setCode('');
      setView('enrolling');
    } catch (err: any) {
      setError(err.message || 'Could not start enrollment.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await verifyMfaCode(supabase, factorId, code);
      toast.success('Two-factor authentication is on.');
      setQrCode(null);
      setSecret(null);
      setCode('');
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancelEnroll = async () => {
    if (factorId) {
      await supabase.auth.mfa.unenroll({ factorId }).catch(() => {});
    }
    setQrCode(null);
    setSecret(null);
    setCode('');
    setError(null);
    await loadStatus();
  };

  const handleDisable = async () => {
    if (!factorId) return;
    const ok = await confirm({
      title: 'Turn off two-factor authentication?',
      description:
        'Your account will be protected by password only until you enroll again.',
      variant: 'danger',
      confirmLabel: 'Turn off',
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
      if (err) throw err;
      toast.success('Two-factor authentication is off.');
      await loadStatus();
    } catch (err: any) {
      setError(err.message || 'Could not disable two-factor authentication.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-6 py-8 max-w-2xl">
      <PageHeader
        title="Security"
        description="Two-factor authentication for your admin account."
      />

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Two-factor authentication</CardTitle>
            {view === 'enabled' && <Badge variant="success">On</Badge>}
            {view === 'disabled' && <Badge variant="muted">Off</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {view === 'loading' && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {view === 'disabled' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Add a second step to sign-in: a 6-digit code from an
                authenticator app (Microsoft Authenticator, Google
                Authenticator, 1Password, …). You&apos;ll be asked for a code
                when you sign in, and at most once every {MFA_MAX_AGE_DAYS} days
                after that.
              </p>
              <Button onClick={handleStartEnroll} loading={busy}>
                <ShieldCheck className="h-4 w-4" /> Enable two-factor
                authentication
              </Button>
            </div>
          )}

          {view === 'enrolling' && (
            <form onSubmit={handleConfirmEnroll} className="space-y-4">
              <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
                <li>
                  Open your authenticator app and choose{' '}
                  <span className="text-foreground">Add account</span> (in
                  Microsoft Authenticator: “Other account”).
                </li>
                <li>Scan the QR code below.</li>
                <li>Enter the 6-digit code the app shows to confirm.</li>
              </ol>

              {qrCode && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCode}
                    alt="Scan this QR code with your authenticator app"
                    className="h-44 w-44 rounded-md border border-border bg-white p-2"
                  />
                </div>
              )}

              {secret && (
                <p className="text-xs text-muted-foreground text-center">
                  Can&apos;t scan? Enter this key manually:{' '}
                  <code className="font-mono text-foreground break-all">{secret}</code>
                </p>
              )}

              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                disabled={busy}
                autoFocus
                placeholder="000000"
                className="w-full px-3 py-3 text-center text-2xl font-mono tracking-[0.5em] border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50"
              />

              <div className="flex gap-2">
                <Button
                  type="submit"
                  loading={busy}
                  disabled={code.length !== 6}
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEnroll}
                  disabled={busy}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {view === 'enabled' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your account asks for a 6-digit code from your authenticator
                app at sign-in, and at most once every {MFA_MAX_AGE_DAYS} days
                on an active session.
              </p>
              <p className="text-sm text-muted-foreground">
                Lost your phone? Another admin can reset two-factor for you
                from your admin profile, then you can re-enroll here.
              </p>
              <Button variant="outline" onClick={handleDisable} loading={busy}>
                <ShieldOff className="h-4 w-4" /> Turn off
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
