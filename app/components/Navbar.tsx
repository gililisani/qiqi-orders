'use client';
import { supabase } from '../../lib/supabaseClient';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function Navbar() {
  const router = useRouter();

const handleLogout = async () => {
  await supabase.auth.signOut();
  router.push('/');
};

  return (
    <nav className="sticky top-5 z-50 bg-white border border-gray-200 rounded-lg shadow-sm mx-6 mt-5 px-4 py-3 flex items-center justify-between">
      <a href="/admin" className="flex items-center space-x-3 hover:opacity-90 transition">
        <Image src="/logo.png" alt="Qiqi Logo" width={100} height={40} />
        <span className="text-lg font-semibold tracking-wide">Partners Hub</span>
      </a>
      <button
        onClick={handleLogout}
        className="bg-black text-white px-3 py-1.5 rounded text-sm hover:opacity-90 transition"
      >
        Log Out
      </button>
    </nav>
  );
}
