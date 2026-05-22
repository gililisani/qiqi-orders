'use client';

/**
 * Set password — landing page for the URL we email users. The token is
 * deliberately NOT validated on page load (so link scanners can hit this
 * page without burning the token); validation happens on form submit.
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

import { supabase } from '../../lib/supabaseClient';
import { fetchWithAuth } from '../../lib/fetchWithAuth';

import { Button } from '../components/qq/button';
import { Input } from '../components/qq/input';
import { Card, CardContent } from '../components/qq/card';
import { FormField } from '../components/qq/form-field';
import { Alert, AlertDescription } from '../components/qq/alert';

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <SetPasswordForm />
    </Suspense>
  );
}

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('This password setup link is missing its token. Please ask your administrator to send a new one.');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('Missing token.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not set your password. Please try again.');
        return;
      }

      setDone(true);

      if (data.autoLogin && data.session?.access_token && data.session?.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (!sessionError) {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const profileRes = await fetchWithAuth(`/api/user-profile?userId=${user.id}`);
              const profile = await profileRes.json().catch(() => ({}));
              const role = profile?.user?.role?.toLowerCase?.();
              router.replace(role === 'admin' ? '/admin' : '/client');
              return;
            }
          } catch {
            /* fall through */
          }
        }
      }
      router.replace('/');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600 mb-4" />
              <h2 className="text-xl font-semibold tracking-tight">Password set</h2>
              <p className="text-sm text-muted-foreground mt-2">Redirecting you now…</p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

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
              <h2 className="text-xl font-semibold tracking-tight">Set your password</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Choose a secure password to finish setting up your account.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <FormField label="New password" helper="At least 6 characters.">
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={submitting || !token}
                  required
                  minLength={6}
                />
              </FormField>

              <FormField label="Confirm password">
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting || !token}
                  required
                  minLength={6}
                />
              </FormField>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" loading={submitting} disabled={!token}>
                {submitting ? 'Setting password…' : 'Set password'}
              </Button>

              <div className="text-center pt-1">
                <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  ← Back to sign in
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
