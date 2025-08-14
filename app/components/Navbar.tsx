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
    <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <Image src="/logo.png" alt="Qiqi Logo" width={100} height={40} />
        <span className="text-lg font-semibold tracking-wide">Orders Dashboard</span>
      </div>
      <button
        onClick={handleLogout}
        className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
      >
        Log Out
      </button>
    </nav>
  );
}
