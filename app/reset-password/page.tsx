'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Link from 'next/link';
import {
  Input,
  Button,
  Typography,
  Alert,
  Spinner,
} from '../components/MaterialTailwind';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/confirm-password-reset`,
      });

      if (error) {
        setError(error.message);
      } else {
        setMessage('We sent you instructions to change your password in an email.');
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="flex items-center justify-center h-full min-h-screen bg-blue-gray-50/50">
      {/* Centered Reset Password Form */}
      <div className="w-full max-w-md px-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img src="/QIQI-Logo.svg" alt="Qiqi Logo" className="h-16 w-auto" />
          </div>
          <h1 className="text-3xl font-bold text-blue-gray-900 mb-4">
            Partners Hub
          </h1>
        </div>

        {/* White Block Design */}
        <div className="bg-white rounded-xl border border-blue-gray-100 shadow-sm p-8">
          <div className="text-center mb-6">
            <Typography variant="h4" className="!font-bold mb-2">
              Reset Password
            </Typography>
            <Typography className="text-base !font-normal !text-blue-gray-500">
              Enter your email address and we'll send you instructions to reset your password.
            </Typography>
          </div>

          <form onSubmit={handleReset} className="mb-2">
            <div className="mb-6">
              <Input
                label="Your email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder={undefined}
                onPointerEnterCapture={undefined}
                onPointerLeaveCapture={undefined}
                crossOrigin={undefined}
              />
            </div>

            {error && (
              <Alert color="red" className="mb-4">
                {error}
              </Alert>
            )}

            {message && (
              <Alert color="green" className="mb-4">
                {message}
              </Alert>
            )}

            <Button
              className="mt-6"
              fullWidth
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  Sending...
                </div>
              ) : (
                'Send Reset Instructions'
              )}
            </Button>

            <div className="flex items-center justify-center gap-2 mt-6">
              <Typography
                variant="small"
                className="!font-medium text-gray-900"
              >
                <Link href="/" className="hover:underline">
                  ← Back to Sign In
                </Link>
              </Typography>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
