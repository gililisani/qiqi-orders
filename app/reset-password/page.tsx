'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Input,
  Button,
  Typography,
  Alert,
  Spinner,
} from '../components/MaterialTailwind';

type Step = 'email' | 'code' | 'password';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Send reset code to email
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);

      if (error) {
        setError(error.message);
      } else {
        // Move to code verification step
        setStep('code');
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Verify the code
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email,
        token: code,
        type: 'recovery',
      });

      if (error) {
        setError('Failed to verify code');
      } else {
        // Move to password change step
        setStep('password');
      }
    } catch (err: any) {
      setError('Failed to verify code');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 3: Save new password and redirect
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setError(error.message);
        setIsSubmitting(false);
        return;
      }

      // Get user to determine role and redirect
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Check user role
        const profileResponse = await fetch(`/api/user-profile?userId=${user.id}`);
        const profileData = await profileResponse.json();

        if (profileData.success) {
          const role = profileData.user.role;
          
          if (role?.toLowerCase() === 'admin') {
            router.push('/admin');
          } else {
            router.push('/client');
          }
        } else {
          // Fallback to client if profile check fails
          router.push('/client');
        }
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
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
          {/* Step 1: Enter Email */}
          {step === 'email' && (
            <>
              <div className="text-center mb-6">
                <Typography variant="h4" className="!font-bold mb-2">
                  Reset Password
                </Typography>
                <Typography className="text-base !font-normal !text-blue-gray-500">
                  Enter your email address and we'll send you a reset code.
                </Typography>
              </div>

              <form onSubmit={handleSendCode} className="mb-2">
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
                    'Send Reset Code'
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

          {/* Step 2: Enter Code */}
          {step === 'code' && (
            <>
              <div className="text-center mb-6">
                <Typography variant="h4" className="!font-bold mb-2">
                  Reset Password
                </Typography>
                <Typography className="text-base !font-normal !text-blue-gray-500 mb-2">
                  Check your email for a reset code
                </Typography>
                <Typography className="text-sm !font-normal !text-blue-gray-400">
                  You'll receive an email if an account associated with the email address exists
                </Typography>
              </div>

              <form onSubmit={handleVerifyCode} className="mb-2">
                <div className="mb-6">
                  <Input
                    label="Code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
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
                      Verifying...
                    </div>
                  ) : (
                    'Confirm Reset Code'
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

          {/* Step 3: Enter New Password */}
          {step === 'password' && (
            <>
              <div className="text-center mb-6">
                <Typography variant="h4" className="!font-bold mb-2">
                  Change your password
                </Typography>
                <Typography className="text-base !font-normal !text-blue-gray-500">
                  Welcome back! Choose a new strong password and save it to proceed
                </Typography>
              </div>

              <form onSubmit={handleSavePassword} className="mb-2">
                <div className="mb-6">
                  <Input
                    label="Password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    placeholder={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                    crossOrigin={undefined}
                  />
                  <Typography className="text-xs !font-normal !text-blue-gray-400 mt-1">
                    Minimum 6 characters
                  </Typography>
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
                      Saving...
                    </div>
                  ) : (
                    'Save new password'
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
