'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [show2FA, setShow2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  const [userData, setUserData] = useState<any>(null);
  const [isRecoveryCode, setIsRecoveryCode] = useState(false);

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

      // Step 3: Check if 2FA is enabled
      const userType = profileData.user.role.toLowerCase();
      const twoFAStatusResponse = await fetch(`/api/2fa/status?userId=${user.id}&userType=${userType}`);
      const twoFAStatus = await twoFAStatusResponse.json();

      if (twoFAStatus.success && twoFAStatus.twoFactorEnabled) {
        // Show 2FA verification form
        setUserData({ user, profile: profileData.user, userType });
        setShow2FA(true);
        return;
      }

      // Step 4: Redirect based on role (no 2FA required)
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
    }
  };

  const handle2FAVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!twoFACode) {
      setErrorMsg('Please enter a verification code');
      return;
    }

    try {
      const response = await fetch('/api/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: userData.user.id, 
          userType: userData.userType, 
          code: twoFACode,
          isRecoveryCode 
        })
      });

      const data = await response.json();

      if (data.success) {
        // 2FA verified, redirect based on role
        const role = userData.profile.role;
        if (role?.toLowerCase() === 'admin') {
          router.push('/admin');
        } else {
          router.push('/client');
        }
      } else {
        setErrorMsg(data.error || 'Invalid verification code');
      }
    } catch (err) {
      console.error('2FA verification error:', err);
      setErrorMsg('Failed to verify code. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="text-center">
          <p className="text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  if (show2FA) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="max-w-md w-full space-y-6 border border-gray-200 p-8 rounded shadow">
          <div className="flex justify-center mb-4">
            <Image src="/logo.png" alt="Qiqi Logo" width={120} height={40} />
          </div>
          <h2 className="text-center text-2xl font-bold text-black">Two-Factor Authentication</h2>
          <p className="text-center text-gray-600">
            Enter the 6-digit code from your authenticator app
          </p>
          
          <form onSubmit={handle2FAVerification} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Verification Code</label>
              <input
                type="text"
                value={twoFACode}
                onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                required
                className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded shadow-sm focus:outline-none text-center text-lg font-mono tracking-widest"
                maxLength={6}
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isRecoveryCode"
                checked={isRecoveryCode}
                onChange={(e) => setIsRecoveryCode(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="isRecoveryCode" className="text-sm text-gray-700">
                This is a recovery code
              </label>
            </div>

            {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}

            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => {
                  setShow2FA(false);
                  setTwoFACode('');
                  setIsRecoveryCode(false);
                  setErrorMsg('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={twoFACode.length !== 6}
                className="flex-1 bg-black text-white py-2 px-4 rounded hover:opacity-90 transition disabled:opacity-50"
              >
                Verify
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="max-w-md w-full space-y-6 border border-gray-200 p-8 rounded shadow">
        <div className="flex justify-center mb-4">
          <Image src="/logo.png" alt="Qiqi Logo" width={120} height={40} />
        </div>
        <h2 className="text-center text-2xl font-bold text-black">Sign in to your account</h2>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded shadow-sm focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full px-4 py-2 border border-gray-300 rounded shadow-sm focus:outline-none"
            />
          </div>

          <div className="text-right">
            <a 
              href="/reset-password" 
              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              Forgot Password?
            </a>
          </div>

          {errorMsg && <p className="text-red-600 text-sm">{errorMsg}</p>}

          <div>
            <button
              type="submit"
              className="w-full bg-black text-white py-2 px-4 rounded hover:opacity-90 transition"
            >
              Sign In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
