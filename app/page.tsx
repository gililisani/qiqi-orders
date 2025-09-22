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
    <section className="grid grid-cols-1 xl:grid-cols-2 items-center h-full min-h-screen">
      {/* Left Column - Login Form */}
      <div className="w-full min-h-screen grid place-items-center bg-white">
        <div className="w-full max-w-md px-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <img src="/QIQI-Logo.svg" alt="Qiqi Logo" className="h-16 w-auto" />
            </div>
            <Typography variant="h2" className="!font-bold mb-4">
              Sign In
            </Typography>
            <Typography className="text-lg !font-normal !text-blue-gray-500">
              Enter your email and password to Sign In.
            </Typography>
          </div>

          <form onSubmit={handleLogin} className="mb-2">
            <div className="mb-6 flex flex-col gap-6">
              <div>
                <Typography
                  variant="small"
                  color="blue-gray"
                  className="-mb-3 !font-medium"
                >
                  Your email
                </Typography>
                <Input 
                  size="lg" 
                  label="Your email" 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Typography
                  variant="small"
                  color="blue-gray"
                  className="-mb-3 !font-medium"
                >
                  Password
                </Typography>
                <Input 
                  type="password" 
                  size="lg" 
                  label="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
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

      {/* Right Column - Pattern Image */}
      <div className="p-8 hidden xl:block bg-gradient-to-br from-blue-gray-50 to-blue-gray-100">
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <Typography variant="h3" color="blue-gray" className="mb-4 font-bold">
              Welcome to Partners Hub
            </Typography>
            <Typography variant="h6" color="blue-gray" className="mb-8">
              Your gateway to streamlined order management
            </Typography>
            <div className="grid grid-cols-1 gap-4 max-w-sm mx-auto">
              <div className="flex items-center gap-3 p-4 bg-white rounded-lg shadow-sm">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <Typography variant="small" color="blue-gray">
                  Real-time order tracking
                </Typography>
              </div>
              <div className="flex items-center gap-3 p-4 bg-white rounded-lg shadow-sm">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <Typography variant="small" color="blue-gray">
                  Secure partner access
                </Typography>
              </div>
              <div className="flex items-center gap-3 p-4 bg-white rounded-lg shadow-sm">
                <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <Typography variant="small" color="blue-gray">
                  Integrated NetSuite sync
                </Typography>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
