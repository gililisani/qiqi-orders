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
    // Handle the hash fragment from the magic link
    const handleAuthCallback = async () => {
      try {
        // Check if we have a hash fragment with tokens
        const hashFragment = window.location.hash;
        
        if (!hashFragment) {
          setError('Invalid password reset link. Please request a new one.');
          setIsValidating(false);
          return;
        }

        // Parse the hash fragment
        const params = new URLSearchParams(hashFragment.substring(1)); // Remove the #
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const type = params.get('type');

        console.log('Password reset callback:', { 
          hasAccessToken: !!accessToken, 
          hasRefreshToken: !!refreshToken, 
          type 
        });

        // Verify this is a recovery/password reset link
        if (type !== 'recovery' || !accessToken) {
          setError('Invalid password reset link. Please request a new one.');
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
          setError('Failed to validate password reset link. Please request a new one.');
          setIsValidating(false);
          return;
        }

        console.log('Session established successfully for password reset');
        // Valid session - user can now set password
        setIsValidating(false);
      } catch (err: any) {
        console.error('Error handling auth callback:', err);
        setError('An error occurred. Please try again.');
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
      // Update the password
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/');
        }, 2000);
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
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
              Redirecting to login page...
            </Typography>
            <Spinner className="h-8 w-8 mx-auto" />
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

