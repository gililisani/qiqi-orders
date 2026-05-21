'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';

type Step = 'email' | 'code';

export default function LoginCodePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Please enter your email.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/request-login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not send code. Please try again.');
        return;
      }
      // Always show generic confirmation — the API intentionally returns
      // success even for unknown emails (anti-enumeration).
      setInfo('If your email is registered as a client, you\'ll receive a 6-digit code shortly. Check your inbox (and spam).');
      setStep('code');
    } catch (err: any) {
      setError(err?.message || 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Code must be 6 digits.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/verify-login-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.session) {
        setError(data.error || 'Could not verify code.');
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      if (sessionError) {
        setError(`Sign-in failed: ${sessionError.message}`);
        return;
      }

      // Resolve role and redirect (always /client for code flow, but check anyway)
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
        // fall through
      }
      router.replace('/client');
    } catch (err: any) {
      setError(err?.message || 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setStep('email');
    setCode('');
    setError(null);
    setInfo(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-6">
          <img src="/QIQI-Logo.svg" alt="Qiqi" className="h-12 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900">Sign in with code</h1>
          <p className="text-sm text-gray-600 mt-2">
            {step === 'email'
              ? 'We\'ll email you a 6-digit code to sign in.'
              : `Enter the 6-digit code we sent to ${email}.`}
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}
        {info && step === 'code' && (
          <div className="mb-4 bg-blue-50 border border-blue-300 text-blue-800 px-4 py-3 rounded text-sm">
            {info}
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleRequestCode} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={submitting}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
                placeholder="you@example.com"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-black text-white px-6 py-3 rounded-md hover:opacity-90 transition disabled:opacity-50 font-medium"
            >
              {submitting ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                disabled={submitting}
                required
                autoFocus
                className="w-full px-3 py-3 text-center text-2xl font-mono tracking-[0.5em] border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
                placeholder="000000"
              />
            </div>
            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className="w-full bg-black text-white px-6 py-3 rounded-md hover:opacity-90 transition disabled:opacity-50 font-medium"
            >
              {submitting ? 'Verifying…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={handleResend}
              disabled={submitting}
              className="w-full text-sm text-gray-600 hover:text-gray-900 underline disabled:opacity-50"
            >
              Use a different email or resend code
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-800 underline">
            Back to password login
          </Link>
        </div>
      </div>
    </div>
  );
}
