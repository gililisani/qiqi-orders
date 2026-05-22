'use client';

/**
 * Login page — two-step (email → password), with optional one-time code
 * for client accounts.
 *
 * Visual: Vercel-style minimal card centered on near-white background.
 * Logic: same as before — POST /api/auth/check-user resolves the role,
 * then we show password input (with code button for clients) or just
 * password (admins).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { fetchWithAuth } from '../lib/fetchWithAuth';

import { Button } from './components/qq/button';
import { Input } from './components/qq/input';
import { Card, CardContent } from './components/qq/card';
import { FormField } from './components/qq/form-field';
import { Alert, AlertDescription } from './components/qq/alert';
import { Separator } from './components/qq/separator';

type Step = 'email' | 'password' | 'code';
type Role = 'admin' | 'client';

export default function LoginPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('email');
  const [role, setRole] = useState<Role>('client');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ---------------------------------------------------------------------------
  // If already logged in, skip the form entirely
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) {
          if (!cancelled) setLoading(false);
          return;
        }
        const profileRes = await fetchWithAuth(`/api/user-profile?userId=${user.id}`);
        const profile = await profileRes.json().catch(() => ({}));
        if (cancelled) return;

        if (!profileRes.ok || !profile.success || !profile.user) {
          await supabase.auth.signOut();
          setErrorMsg('Your session could not be verified. Please sign in again.');
          setLoading(false);
          return;
        }
        const r = profile.user.role;
        router.push(typeof r === 'string' && r.toLowerCase() === 'admin' ? '/admin' : '/client');
      } catch (err) {
        console.error('Error checking user:', err);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ---------------------------------------------------------------------------
  // Step 1 — email → resolve role
  // ---------------------------------------------------------------------------
  const handleEmailContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/check-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not continue. Please try again.');
        return;
      }
      setRole(data.role === 'admin' ? 'admin' : 'client');
      setStep('password');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 2a — password sign-in
  // ---------------------------------------------------------------------------
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setErrorMsg(error.message);
        return;
      }
      if (!data.user) {
        setErrorMsg('Sign-in succeeded but no user was returned.');
        return;
      }
      const profileRes = await fetchWithAuth(`/api/user-profile?userId=${data.user.id}`);
      const profile = await profileRes.json().catch(() => ({}));
      if (!profileRes.ok || !profile.success || !profile.user) {
        await supabase.auth.signOut();
        setErrorMsg(
          typeof profile.error === 'string'
            ? profile.error
            : 'Your account is not set up for this portal. Please contact support.'
        );
        return;
      }
      const r = profile.user.role;
      router.push(typeof r === 'string' && r.toLowerCase() === 'admin' ? '/admin' : '/client');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 2b — request 6-digit code (clients only)
  // ---------------------------------------------------------------------------
  const handleRequestCode = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/request-login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not send code.');
        return;
      }
      setInfoMsg(`We sent a 6-digit code to ${email.trim()}. It expires in 10 minutes.`);
      setStep('code');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 3 — verify code
  // ---------------------------------------------------------------------------
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!/^\d{6}$/.test(code.trim())) {
      setErrorMsg('Code must be 6 digits.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/verify-login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session) {
        setErrorMsg(data.error || 'Could not verify code.');
        return;
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionError) {
        setErrorMsg(`Sign-in failed: ${sessionError.message}`);
        return;
      }
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const profileRes = await fetchWithAuth(`/api/user-profile?userId=${user.id}`);
          const profile = await profileRes.json().catch(() => ({}));
          const r = profile?.user?.role?.toLowerCase?.();
          router.replace(r === 'admin' ? '/admin' : '/client');
          return;
        }
      } catch {
        /* fall through */
      }
      router.replace('/client');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Network error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    setErrorMsg('');
    setInfoMsg('');
    setPassword('');
    setCode('');
    if (step === 'code') setStep('password');
    else if (step === 'password') setStep('email');
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/QIQI-Logo.svg" alt="Qiqi" className="h-10 w-auto mx-auto mb-3" />
          <h1 className="text-base font-medium text-muted-foreground">Partners Hub</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            {/* ============================================================== */}
            {/* Step 1 — Email                                                  */}
            {/* ============================================================== */}
            {step === 'email' && (
              <>
                <div className="mb-6">
                  <h2 className="text-xl font-semibold tracking-tight">Sign in</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enter your email to continue.
                  </p>
                </div>

                <form onSubmit={handleEmailContinue} className="space-y-4">
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

                  {errorMsg && (
                    <Alert variant="destructive">
                      <AlertDescription>{errorMsg}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full" loading={isSubmitting}>
                    {isSubmitting ? 'Continuing…' : 'Continue'}
                  </Button>
                </form>
              </>
            )}

            {/* ============================================================== */}
            {/* Step 2 — Password (admin = no code; client = code + password)   */}
            {/* ============================================================== */}
            {step === 'password' && (
              <>
                <div className="mb-6">
                  <h2 className="text-xl font-semibold tracking-tight">Welcome back</h2>
                  <p className="text-sm text-muted-foreground mt-1 truncate">{email}</p>
                </div>

                {role === 'client' && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleRequestCode}
                      loading={isSubmitting}
                    >
                      {isSubmitting ? 'Sending code…' : 'Email me a sign-in code'}
                    </Button>

                    <div className="relative my-5">
                      <Separator />
                      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                        or use password
                      </span>
                    </div>
                  </>
                )}

                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <FormField label="Password">
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormField>

                  {errorMsg && (
                    <Alert variant="destructive">
                      <AlertDescription>{errorMsg}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" className="w-full" loading={isSubmitting}>
                    {isSubmitting ? 'Signing in…' : 'Sign in'}
                  </Button>

                  <div className="flex items-center justify-between pt-1 text-sm">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Use a different email
                    </button>
                    <Link href="/reset-password" className="text-muted-foreground hover:text-foreground transition-colors">
                      Forgot password?
                    </Link>
                  </div>
                </form>
              </>
            )}

            {/* ============================================================== */}
            {/* Step 3 — Code entry                                             */}
            {/* ============================================================== */}
            {step === 'code' && (
              <>
                <div className="mb-6">
                  <h2 className="text-xl font-semibold tracking-tight">Enter your code</h2>
                  <p className="text-sm text-muted-foreground mt-1 truncate">{email}</p>
                </div>

                {infoMsg && (
                  <Alert variant="info" className="mb-4">
                    <AlertDescription>{infoMsg}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    disabled={isSubmitting}
                    required
                    autoFocus
                    placeholder="000000"
                    className="w-full px-3 py-3 text-center text-2xl font-mono tracking-[0.5em] border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50"
                  />

                  {errorMsg && (
                    <Alert variant="destructive">
                      <AlertDescription>{errorMsg}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    loading={isSubmitting}
                    disabled={code.length !== 6}
                  >
                    {isSubmitting ? 'Verifying…' : 'Sign in'}
                  </Button>

                  <div className="flex items-center justify-between pt-1 text-sm">
                    <button
                      type="button"
                      onClick={handleBack}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleRequestCode}
                      disabled={isSubmitting}
                      className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      Resend code
                    </button>
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
