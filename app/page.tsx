'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

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

      // Step 2: Check if user exists in users table
      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      console.log('Profile data:', profile);
      console.log('Profile error:', profileError);

      if (profileError) {
        console.error('Error fetching user profile:', profileError);
        // If user doesn't exist in users table, create them as client
        const { error: insertError } = await supabase
          .from('users')
          .insert([{ id: user.id, role: 'client' }]);

        if (insertError) {
          console.error('Error creating user profile:', insertError);
          setErrorMsg('Failed to create user profile. Please contact support.');
          return;
        }
        
        // Redirect to client after creating profile
        router.push('/client');
        return;
      }

      // Step 3: Redirect based on role
      if (profile?.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/client');
      }
    } catch (err) {
      console.error('Login error:', err);
      setErrorMsg('An unexpected error occurred. Please try again.');
    }
  };

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
