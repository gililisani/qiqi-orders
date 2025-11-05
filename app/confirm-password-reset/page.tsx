'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Typography,
  Alert,
  Spinner,
} from '../components/MaterialTailwind';

export default function ConfirmPasswordResetPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    // Handle the hash fragment or query parameters from the magic link
    const handleAuthCallback = async () => {
      try {
        // Check both hash fragment and query parameters
        // Some email clients convert # to ? or vice versa
        const hashFragment = window.location.hash;
        const searchParams = window.location.search;
        const fullUrl = window.location.href;
        
        let params: URLSearchParams;
        let accessToken: string | null = null;
        let refreshToken: string | null = null;
        let type: string | null = null;
        
        // Try to extract tokens from hash fragment first
        if (hashFragment) {
          params = new URLSearchParams(hashFragment.substring(1));
          accessToken = params.get('access_token');
          refreshToken = params.get('refresh_token');
          type = params.get('type');
        }
        
        // If not found in hash, try query parameters
        if (!accessToken && searchParams) {
          params = new URLSearchParams(searchParams.substring(1));
          accessToken = params.get('access_token');
          refreshToken = params.get('refresh_token');
          type = params.get('type');
        }
        
        // Try to extract from full URL if email client modified the format
        // Some email clients strip # and convert to ? or modify the URL structure
        if (!accessToken) {
          // Try to find tokens in the URL string directly
          const tokenMatch = fullUrl.match(/access_token=([^&]+)/);
          const refreshMatch = fullUrl.match(/refresh_token=([^&]+)/);
          const typeMatch = fullUrl.match(/type=([^&]+)/);
          
          if (tokenMatch) {
            accessToken = decodeURIComponent(tokenMatch[1]);
            refreshToken = refreshMatch ? decodeURIComponent(refreshMatch[1]) : null;
            type = typeMatch ? decodeURIComponent(typeMatch[1]) : null;
          }
        }

        console.log('Password reset callback:', { 
          hasHash: !!hashFragment,
          hasSearch: !!searchParams,
          hasAccessToken: !!accessToken, 
          hasRefreshToken: !!refreshToken, 
          type,
          fullUrl: fullUrl.substring(0, 200) // Log first 200 chars to avoid logging full tokens
        });

        // Verify this is a recovery/password reset link
        if (!accessToken) {
          console.error('No access token found in URL');
          setError('Invalid password reset link. The link appears to be corrupted or incomplete. Please request a new password reset link from your administrator.');
          setIsValidating(false);
          return;
        }

        if (type && type !== 'recovery') {
          console.error('Invalid link type:', type);
          setError('Invalid password reset link type. Please request a new password reset link.');
          setIsValidating(false);
          return;
        }

        // Set the session using the tokens from the URL
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || ''
        });

        if (sessionError || !data.session) {
          console.error('Session error:', sessionError);
          console.error('Full URL length:', fullUrl.length);
          console.error('Hash:', hashFragment ? hashFragment.substring(0, 100) : 'none');
          console.error('Search:', searchParams ? searchParams.substring(0, 100) : 'none');
          
          // Check if the error is due to an expired token
          const errorMessage = sessionError?.message?.toLowerCase() || '';
          if (errorMessage.includes('expired') || errorMessage.includes('jwt expired')) {
            setError('This password reset link has expired. Password reset links are valid for 24 hours. Please contact your administrator to send you a new password setup link.');
          } else if (errorMessage.includes('invalid') || errorMessage.includes('token') || errorMessage.includes('malformed')) {
            setError('Invalid password reset link. The link may have been corrupted by your email client. Please try copying the full link from your email and pasting it directly into your browser, or request a new password reset link.');
          } else {
            setError(`Failed to validate password reset link: ${sessionError?.message || 'Unknown error'}. Please request a new one from your administrator.`);
          }
          setIsValidating(false);
          return;
        }

        console.log('Session established successfully for password reset');
        // Valid session - user can now set password
        setIsValidating(false);
      } catch (err: any) {
        console.error('Error handling auth callback:', err);
        setError(`An error occurred while processing the reset link: ${err.message || 'Unknown error'}. Please try requesting a new password reset link.`);
        setIsValidating(false);
      }
    };

    handleAuthCallback();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setIsSubmitting(false);
      return;
    }

    // Validate password length
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      setIsSubmitting(false);
      return;
    }

    try {
      // First verify we still have a valid session
      const { data: { session }, error: sessionCheckError } = await supabase.auth.getSession();
      
      if (sessionCheckError || !session) {
        const errorMessage = sessionCheckError?.message?.toLowerCase() || '';
        if (errorMessage.includes('expired') || errorMessage.includes('invalid') || errorMessage.includes('token')) {
          setError('Your session has expired. Password reset links are valid for 24 hours. Please request a new password setup link from your administrator.');
        } else {
          setError('Auth session missing! Please click the password reset link in your email again.');
        }
        setIsSubmitting(false);
        return;
      }

      // Update the password
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        const errorMessage = error.message?.toLowerCase() || '';
        if (errorMessage.includes('expired') || errorMessage.includes('invalid') || errorMessage.includes('token') || errorMessage.includes('session')) {
          setError('Your session has expired. Password reset links are valid for 24 hours. Please request a new password setup link from your administrator.');
        } else {
          setError(error.message);
        }
      } else {
        // Sign out after password is set (don't auto-login)
        await supabase.auth.signOut();
        setSuccess(true);
      }
    } catch (err: any) {
      const errorMessage = err?.message?.toLowerCase() || '';
      if (errorMessage.includes('expired') || errorMessage.includes('invalid') || errorMessage.includes('token') || errorMessage.includes('session')) {
        setError('Your session has expired. Password reset links are valid for 24 hours. Please request a new password setup link from your administrator.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg">
          <div className="text-center">
            <Spinner className="h-8 w-8 mx-auto" />
            <p className="mt-4 text-gray-600">Validating your reset link...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg">
        <div className="text-center mb-6">
          <img
            src="/logo.png"
            alt="Qiqi Logo"
            className="h-12 mx-auto mb-4"
          />
          <Typography variant="h4" className="font-bold text-gray-800">
            Set Your Password
          </Typography>
          <Typography variant="small" className="text-gray-600 mt-2">
            Choose a secure password for your account
          </Typography>
        </div>

        {error && !success && (
          <Alert color="red" className="mb-4">
            {error}
          </Alert>
        )}

        {success ? (
          <div className="text-center py-8">
            <div className="text-green-600 text-5xl mb-4">✓</div>
            <Typography variant="h5" className="text-gray-800 mb-2">
              Password Set Successfully!
            </Typography>
            <Typography variant="small" className="text-gray-600 mb-4">
              Your password has been updated. You can now log in to your account.
            </Typography>
            <Link
              href="/"
              className="inline-block bg-black text-white px-8 py-3 rounded-md hover:opacity-90 transition font-medium mt-4"
            >
              Go to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Password *
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={isSubmitting}
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
                placeholder="Enter your password"
              />
              <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password *
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isSubmitting}
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
                placeholder="Confirm your password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-black text-white px-6 py-3 rounded-md hover:opacity-90 transition disabled:opacity-50 font-medium"
            >
              {isSubmitting ? 'Setting Password...' : 'Set Password'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Typography variant="small" className="text-gray-600">
            Need help?{' '}
            <Link href="/" className="text-black hover:underline">
              Back to Login
            </Link>
          </Typography>
        </div>
      </div>
    </div>
  );
}

