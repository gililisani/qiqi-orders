'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import {
  Input,
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
    // Check if we have a valid session from the magic link
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
          setError('Invalid or expired password reset link. Please request a new one.');
          setIsValidating(false);
          return;
        }

        // Valid session - user can now set password
        setIsValidating(false);
      } catch (err: any) {
        setError('An error occurred. Please try again.');
        setIsValidating(false);
      }
    };

    checkSession();
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
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={isSubmitting}
                className="!border-gray-300"
                placeholder="Enter your password"
              />
              <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password *
              </label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isSubmitting}
                className="!border-gray-300"
                placeholder="Confirm your password"
              />
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-black"
            >
              {isSubmitting ? 'Setting Password...' : 'Set Password'}
            </Button>
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

