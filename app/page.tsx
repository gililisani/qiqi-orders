'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import Image from 'next/image';
import Link from 'next/link';
import {
  Input,
  Button,
  Typography,
  Alert,
  Spinner,
} from './components/MaterialTailwind';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if user is already logged in
  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          console.log('User already logged in:', user.id);
          // User is already logged in, redirect based on role
          const profileResponse = await fetch(`/api/user-profile?userId=${user.id}`);
          const profileData = await profileResponse.json();

          if (profileData.success && profileData.user?.role?.toLowerCase() === 'admin') {
            router.push('/admin');
          } else {
            router.push('/client');
          }
        }
      } catch (error) {
        console.error('Error checking user:', error);
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);

    try {
      // Step 1: Authenticate with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      const { user } = data;
      console.log('User authenticated:', user?.id);

      // Step 2: Check if user exists in users table using API route
      const isSuperAdmin = user.email === 'gili@qiqiglobal.com';
      const userRole = isSuperAdmin ? 'Admin' : 'Client';
      
      const profileResponse = await fetch('/api/user-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          role: userRole
        })
      });

      const profileData = await profileResponse.json();
      console.log('Profile API response:', profileData);

      if (!profileData.success) {
        console.error('Error with user profile:', profileData.error);
        setErrorMsg(`Failed to create user profile: ${profileData.error}. Please contact support.`);
        return;
      }

      // Step 3: Redirect based on role
      const role = profileData.user.role;
      console.log('Redirecting user with role:', role);
      
      if (role?.toLowerCase() === 'admin') {
        console.log('Redirecting to /admin');
        router.push('/admin');
      } else {
        console.log('Redirecting to /client - role is:', role);
        router.push('/client');
      }
    } catch (err) {
      console.error('Login error:', err);
      setErrorMsg('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-blue-gray-50/50">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-12 w-12" />
          <Typography variant="h6" color="blue-gray">
            Loading...
          </Typography>
        </div>
      </div>
    );
  }

  return (
    <section className="flex items-center justify-center h-full min-h-screen bg-blue-gray-50/50">
      {/* Centered Login Form */}
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
              Sign In
            </Typography>
            <Typography className="text-base !font-normal !text-blue-gray-500">
              Enter your email and password to Sign In.
            </Typography>
          </div>

          <form onSubmit={handleLogin} className="mb-2">
            <div className="mb-6 flex flex-col gap-6">
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
              <div className="relative">
                <Input 
                  type={showPassword ? "text" : "password"} 
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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

            {errorMsg && (
              <Alert color="red" className="mb-4">
                {errorMsg}
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
                  Signing In...
                </div>
              ) : (
                'Sign In'
              )}
            </Button>

            <div className="flex items-center justify-end gap-2 mt-6">
              <Typography
                variant="small"
                className="!font-medium text-gray-900"
              >
                <Link href="/reset-password" className="hover:underline">
                  Forgot Password?
                </Link>
              </Typography>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
