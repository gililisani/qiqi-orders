'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../lib/supabaseClient';
import { fetchWithAuth } from '../../lib/fetchWithAuth';

export default function SetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Note: we deliberately do NOT validate the token on page load. That's the
  // whole point of this flow — link scanners can hit this URL freely without
  // burning anything. The token is validated only when the user submits.

  useEffect(() => {
    // If the link is malformed (missing token), surface it early.
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

      // If the server gave us session tokens, auto-login and redirect by role
      if (data.autoLogin && data.session?.access_token && data.session?.refresh_token) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        if (!sessionError) {
          // Resolve role via the user-profile endpoint, then redirect
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              const profileRes = await fetchWithAuth(`/api/user-profile?userId=${user.id}`);
              const profile = await profileRes.json().catch(() => ({}));
              const role = profile?.user?.role?.toLowerCase?.();
              router.replace(role === 'admin' ? '/admin' : '/client');
              return;
            }
          } catch (e) {
            // fall through to manual login
          }
        }
      }

      // Auto-login didn't work — send them to the login page
      router.replace('/');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-green-600 text-5xl mb-4">✓</div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Password set</h1>
          <p className="text-gray-600 mb-6">Redirecting you now…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="Qiqi" className="h-10 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-gray-900">Set your password</h1>
          <p className="text-sm text-gray-600 mt-2">
            Choose a secure password to finish setting up your account.
          </p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              disabled={submitting || !token}
              required
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
              placeholder="At least 6 characters"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Confirm password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              disabled={submitting || !token}
              required
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
              placeholder="Re-enter password"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !token}
            className="w-full bg-black text-white px-6 py-3 rounded-md hover:opacity-90 transition disabled:opacity-50 font-medium"
          >
            {submitting ? 'Setting password…' : 'Set password'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-800 underline">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
