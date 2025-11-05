'use client';

import { useState } from 'react';
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
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Send password reset link via API (uses custom email service, not Supabase)
  const handleSendResetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to send reset link. Please try again.');
      } else {
        setSuccess(true);
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
          {success ? (
            <>
              <div className="text-center mb-6">
                <div className="text-green-600 text-5xl mb-4">✓</div>
                <Typography variant="h4" className="!font-bold mb-2">
                  Check Your Email
                </Typography>
                <Typography className="text-base !font-normal !text-blue-gray-500">
                  We've sent a password reset link to <strong>{email}</strong>
                </Typography>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <Typography variant="small" className="!font-normal !text-blue-800">
                  <strong>Next steps:</strong>
                  <br />
                  1. Check your email inbox (and spam folder)
                  <br />
                  2. Click the "Reset My Password" button in the email
                  <br />
                  3. Set your new password
                </Typography>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <Typography variant="small" className="!font-normal !text-yellow-800">
                  <strong>Note:</strong> The reset link will expire in 24 hours. If you don't see the email, check your spam folder or contact your administrator.
                </Typography>
              </div>

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
            </>
          ) : (
            <>
              <div className="text-center mb-6">
                <Typography variant="h4" className="!font-bold mb-2">
                  Reset Password
                </Typography>
                <Typography className="text-base !font-normal !text-blue-gray-500">
                  Enter your email address and we'll send you a password reset link.
                </Typography>
              </div>

              <form onSubmit={handleSendResetLink} className="mb-2">
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
                    'Send Reset Link'
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
            </>
          )}
        </div>
      </div>
    </section>
  );
}
