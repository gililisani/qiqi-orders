'use client';

/**
 * Request a password reset link.
 * Always shows generic success regardless of whether the email is registered
 * (anti-enumeration). The actual lookup + email send happens in
 * /api/auth/reset-password.
 */

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

import { Button } from '../components/qq/button';
import { Input } from '../components/qq/input';
import { Card, CardContent } from '../components/qq/card';
import { FormField } from '../components/qq/form-field';
import { Alert, AlertDescription } from '../components/qq/alert';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to send reset link. Please try again.');
        return;
      }
      setSuccess(true);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
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
            {success ? (
              <div className="text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600 mb-4" />
                <h2 className="text-xl font-semibold tracking-tight">Check your email</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  If an account exists for <span className="text-foreground">{email}</span>, a reset link is on the way.
                </p>
                <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                  The link expires in 24 hours. Check your spam folder if you don't see it within a few minutes.
                </p>
                <Link
                  href="/"
                  className="inline-block mt-6 text-sm text-foreground hover:underline"
                >
                  ← Back to sign in
                </Link>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-xl font-semibold tracking-tight">Reset password</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enter your email and we'll send you a link to reset your password.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <FormField label="Email">
                    <Input
                      type="email"
                      autoComplete="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </FormField>

                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full" loading={submitting}>
                    {submitting ? 'Sending…' : 'Send reset link'}
                  </Button>

                  <div className="text-center pt-1">
                    <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                      ← Back to sign in
                    </Link>
                  </div>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
