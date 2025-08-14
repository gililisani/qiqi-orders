'use client';

import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        const { data, error } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();
        if (data?.role === 'admin') router.push('/admin');
        else router.push('/client');
      } else {
        setLoading(false);
      }
    });
  }, []);

  const handleLogin = async () => {
    await supabase.auth.signInWithOtp({
      email: prompt('Enter your email') || '',
    });
    alert('Check your email for a login link');
  };

  return (
    <main className="flex flex-col items-center justify-center h-screen bg-white">
      <img src="/logo.png" alt="Qiqi Logo" className="w-40 mb-8" />
      {loading ? (
        <p>Loading...</p>
      ) : (
        <button
          onClick={handleLogin}
          className="bg-black text-white px-6 py-3 rounded-xl text-lg hover:opacity-80"
        >
          Log in with Email
        </button>
      )}
    </main>
  );
}
