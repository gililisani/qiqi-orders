'use client';

/**
 * Full-screen 6-digit prompt shown by the admin layout when an enrolled
 * admin's session needs (re-)verification: a session that never passed the
 * code (e.g. opened on another device), or one whose last code entry is
 * older than MFA_MAX_AGE_DAYS. Just the code — not a full re-login.
 */

import { useState } from 'react';

import { supabase } from '../../../lib/supabaseClient';
import { verifyMfaCode } from '../../../lib/mfa';
import { Card, CardContent } from '../qq/card';
import { Button } from '../qq/button';
import { Alert, AlertDescription } from '../qq/alert';

interface MfaVerifyGateProps {
  factorId: string;
  /** True when this is the 30-day refresh rather than a first verification. */
  stale: boolean;
  onVerified: () => void;
  onSignOut: () => void;
}

export function MfaVerifyGate({
  factorId,
  stale,
  onVerified,
  onSignOut,
}: MfaVerifyGateProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await verifyMfaCode(supabase, factorId, code);
      onVerified();
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/QIQI-Logo.svg" alt="Qiqi" className="h-10 w-auto mx-auto mb-3" />
          <h1 className="text-base font-medium text-muted-foreground">Partners Hub</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold tracking-tight">
                Two-factor check
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {stale
                  ? 'It has been a while — enter a code from your authenticator app to continue.'
                  : 'Enter the 6-digit code from your authenticator app.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                disabled={busy}
                required
                autoFocus
                placeholder="000000"
                className="w-full px-3 py-3 text-center text-2xl font-mono tracking-[0.5em] border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50"
              />

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full"
                loading={busy}
                disabled={code.length !== 6}
              >
                {busy ? 'Verifying…' : 'Verify'}
              </Button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={onSignOut}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign out
                </button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
