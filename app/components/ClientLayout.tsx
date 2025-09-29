'use client';

import { useAuth } from '../hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Image from 'next/image';
import Link from 'next/link';
import TopNavbarClient from './ui/TopNavbarClient';

interface ClientLayoutProps {
  children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileOpenSections, setMobileOpenSections] = useState<string[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/');
        return;
      }
      if (user.role !== 'Client') {
        router.push('/admin');
        return;
      }
    }
  }, [user, loading, router]);

  // Add small delay to ensure auth context is fully established
  useEffect(() => {
    if (!loading && user && user.role === 'Client') {
      const timer = setTimeout(() => {
        setAuthReady(true);
      }, 100); // 100ms delay to ensure auth context is ready
      
      return () => clearTimeout(timer);
    } else {
      setAuthReady(false);
    }
  }, [loading, user]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setOpenDropdown(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleMouseEnter = (menuName: string) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setOpenDropdown(menuName);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 100); // Small delay to allow moving to dropdown
  };

  const toggleMobileSection = (sectionName: string) => {
    setMobileOpenSections(prev => 
      prev.includes(sectionName) 
        ? prev.filter(name => name !== sectionName)
        : [...prev, sectionName]
    );
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (error) {
      console.error('Error signing out:', error);
      // Force redirect even if signOut fails
      window.location.href = '/';
    }
  };

  const clientMenuItems = [
    {
      name: 'Dashboard',
      items: [
        { name: 'Overview', href: '/client' }
      ]
    },
    {
      name: 'Orders',
      items: [
        { name: 'New Order', href: '/client/orders/new' },
        { name: 'Order History', href: '/client/orders' }
      ]
    }
  ];

  if (loading || !authReady) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'Client') {
    return null;
  }

  return (
    <div className="min-h-screen bg-blue-gray-50/50">
      <TopNavbarClient />
      {/* Global container like Admin */}
      <div className="mx-auto w-full max-w-[1600px] px-4 lg:px-6 xl:px-10 pt-12 pb-16 space-y-16">
        {/* Main Content */}
        <div className="relative">
          {children}
        </div>
      </div>
    </div>
  );
}