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
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoFilled, setIsAutoFilled] = useState(false);

  // Handle auto-fill detection
  useEffect(() => {
    const checkAutoFill = () => {
      const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
      const passwordInput = document.querySelector('input[type="password"]') as HTMLInputElement;
      
      if (emailInput && emailInput.value && !email) {
        setEmail(emailInput.value);
        setIsAutoFilled(true);
      }
      if (passwordInput && passwordInput.value && !password) {
        setPassword(passwordInput.value);
        setIsAutoFilled(true);
      }
    };

    // Check for auto-fill after component mounts
    const timeout = setTimeout(checkAutoFill, 200);
    return () => clearTimeout(timeout);
  }, [email, password]);

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
                size="lg" 
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
              <Input 
                type="password" 
                size="lg" 
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={undefined}
                onPointerEnterCapture={undefined}
                onPointerLeaveCapture={undefined}
                crossOrigin={undefined}
              />
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
