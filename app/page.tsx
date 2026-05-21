'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import {
  Input,
  Button,
  Typography,
  Alert,
  Spinner,
} from './components/MaterialTailwind';

type Step = 'email' | 'password' | 'code';
type Role = 'admin' | 'client';

export default function LoginPage() {
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<Step>('email');
  const [role, setRole] = useState<Role>('client');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');

  // UI state
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already logged in, skip the login form entirely
  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const profileResponse = await fetchWithAuth(`/api/user-profile?userId=${user.id}`);
          const profileData = await profileResponse.json().catch(() => ({}));

          if (!profileResponse.ok || !profileData.success || !profileData.user) {
            await supabase.auth.signOut();
            setErrorMsg('Your session could not be verified. Please sign in again.');
            setLoading(false);
            return;
          }

          const userRole = profileData.user.role;
          router.push(typeof userRole === 'string' && userRole.toLowerCase() === 'admin' ? '/admin' : '/client');
        }
      } catch (error) {
        console.error('Error checking user:', error);
      } finally {
        setLoading(false);
      }
    };
    checkUser();
  }, [router]);

  // ---------------------------------------------------------------------------
  // Step 1: Email — find out which UI to show
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
  // Step 2a: Password — same as old login flow
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
      const { user } = data;
      if (!user) {
        setErrorMsg('Sign-in succeeded but no user was returned.');
        return;
      }

      const profileResponse = await fetchWithAuth(`/api/user-profile?userId=${user.id}`);
      const profileData = await profileResponse.json().catch(() => ({}));

      if (!profileResponse.ok || !profileData.success || !profileData.user) {
        await supabase.auth.signOut();
        setErrorMsg(
          typeof profileData.error === 'string'
            ? profileData.error
            : 'Your account is not set up for this portal. Please contact support.'
        );
        return;
      }

      const userRole = profileData.user.role;
      router.push(typeof userRole === 'string' && userRole.toLowerCase() === 'admin' ? '/admin' : '/client');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 2b: Request a one-time code (client only)
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
  // Step 3: Verify code
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
          const userRole = profile?.user?.role?.toLowerCase?.();
          router.replace(userRole === 'admin' ? '/admin' : '/client');
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
    if (step === 'code') {
      setStep('password');
    } else if (step === 'password') {
      setStep('email');
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-12 w-12" />
          <Typography variant="h6" color="blue-gray">Loading...</Typography>
        </div>
      </div>
    );
  }

  return (
    <section className="flex items-center justify-center h-full min-h-screen bg-blue-gray-50/50">
      <div className="w-full max-w-md px-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img src="/QIQI-Logo.svg" alt="Qiqi Logo" className="h-16 w-auto" />
          </div>
          <h1 className="text-3xl font-bold text-blue-gray-900 mb-4">Partners Hub</h1>
        </div>

        <div className="bg-white rounded-xl border border-blue-gray-100 shadow-sm p-8">
          {/* ------------------------------------------------------------- */}
          {/* Step 1: Email                                                   */}
          {/* ------------------------------------------------------------- */}
          {step === 'email' && (
            <>
              <div className="text-center mb-6">
                <Typography variant="h4" className="!font-bold mb-2">Sign In</Typography>
                <Typography className="text-base !font-normal !text-blue-gray-500">
                  Enter your email to continue.
                </Typography>
              </div>

              <form onSubmit={handleEmailContinue}>
                <div className="mb-6">
                  <Input
                    label="Your email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                    crossOrigin={undefined}
                  />
                </div>
                {errorMsg && <Alert color="red" className="mb-4">{errorMsg}</Alert>}
                <Button className="mt-2" fullWidth type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <div className="flex items-center gap-2"><Spinner className="h-4 w-4" />Continuing…</div>
                  ) : 'Continue'}
                </Button>
              </form>
            </>
          )}

          {/* ------------------------------------------------------------- */}
          {/* Step 2: Password (admin = no code button; client = with code) */}
          {/* ------------------------------------------------------------- */}
          {step === 'password' && (
            <>
              <div className="text-center mb-6">
                <Typography variant="h4" className="!font-bold mb-2">Welcome back</Typography>
                <Typography className="text-base !font-normal !text-blue-gray-500">
                  {email}
                </Typography>
              </div>

              {role === 'client' && (
                <div className="mb-6">
                  <Button
                    variant="outlined"
                    fullWidth
                    onClick={handleRequestCode}
                    disabled={isSubmitting}
                    type="button"
                    placeholder={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                  >
                    {isSubmitting ? 'Sending…' : 'Email me a sign-in code'}
                  </Button>
                  <div className="relative my-5">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-blue-gray-100" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-2 text-blue-gray-400 uppercase tracking-wider">
                        or use password
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handlePasswordLogin}>
                <div className="mb-6">
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      label="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoFocus
                      placeholder={undefined}
                      onPointerEnterCapture={undefined}
                      onPointerLeaveCapture={undefined}
                      crossOrigin={undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                    >
                      {showPassword ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {errorMsg && <Alert color="red" className="mb-4">{errorMsg}</Alert>}

                <Button fullWidth type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <div className="flex items-center gap-2"><Spinner className="h-4 w-4" />Signing In…</div>
                  ) : 'Sign In'}
                </Button>

                <div className="flex items-center justify-between gap-2 mt-6">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-sm font-medium text-gray-700 hover:underline"
                  >
                    Use a different email
                  </button>
                  <Link href="/reset-password" className="text-sm font-medium text-gray-900 hover:underline">
                    Forgot password?
                  </Link>
                </div>
              </form>
            </>
          )}

          {/* ------------------------------------------------------------- */}
          {/* Step 3: Code entry (clients only)                               */}
          {/* ------------------------------------------------------------- */}
          {step === 'code' && (
            <>
              <div className="text-center mb-6">
                <Typography variant="h4" className="!font-bold mb-2">Enter your code</Typography>
                <Typography className="text-base !font-normal !text-blue-gray-500">
                  {email}
                </Typography>
              </div>

              {infoMsg && <Alert color="blue" className="mb-4">{infoMsg}</Alert>}

              <form onSubmit={handleVerifyCode}>
                <div className="mb-6">
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
                    className="w-full px-3 py-3 text-center text-2xl font-mono tracking-[0.5em] border border-blue-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
                  />
                </div>

                {errorMsg && <Alert color="red" className="mb-4">{errorMsg}</Alert>}

                <Button fullWidth type="submit" disabled={isSubmitting || code.length !== 6}>
                  {isSubmitting ? (
                    <div className="flex items-center gap-2"><Spinner className="h-4 w-4" />Verifying…</div>
                  ) : 'Sign In'}
                </Button>

                <div className="flex items-center justify-between gap-2 mt-6">
                  <button
                    type="button"
                    onClick={handleBack}
                    className="text-sm font-medium text-gray-700 hover:underline"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestCode}
                    disabled={isSubmitting}
                    className="text-sm font-medium text-gray-900 hover:underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
