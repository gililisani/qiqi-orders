'use client';

import { useAuth } from '../hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Image from 'next/image';
import Link from 'next/link';

interface ClientLayoutProps {
  children: React.ReactNode;
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileOpenSections, setMobileOpenSections] = useState<string[]>([]);
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

  if (loading) {
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
    <div className="min-h-screen bg-gray-50">
      {/* Header with Menu */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 px-6 py-2">
        <div className="flex items-center justify-between">
          {/* Logo and Brand */}
          <a href="/client" className="flex items-center space-x-3 hover:opacity-90 transition">
            <Image src="/logo.png" alt="Qiqi Logo" width={80} height={32} />
            <span className="text-lg font-semibold tracking-wide">Partners Hub</span>
          </a>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-1">
            {clientMenuItems.map((menu) => (
              <div 
                key={menu.name} 
                className="relative"
                onMouseEnter={() => handleMouseEnter(menu.name)}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdown(openDropdown === menu.name ? null : menu.name);
                  }}
                >
                  {menu.name}
                  <svg className="w-4 h-4 ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown */}
                {openDropdown === menu.name && (
                  <div className="absolute top-full left-0 w-48 bg-white border border-gray-200 py-1 z-50">
                    {menu.items.map((item) => (
                      <Link
                        key={item.name}
                        href={item.href}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                        onClick={() => setOpenDropdown(null)}
                      >
                        {item.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right Side - User info, Logout and Mobile Menu */}
          <div className="flex items-center space-x-3">
            {/* User Info */}
            <span className="hidden md:block text-sm text-gray-600">
              Welcome, {user.name}
            </span>
            
            {/* Always Visible Logout */}
            <button
              onClick={handleLogout}
              className="bg-black text-white px-3 py-1 text-xs hover:opacity-90 transition"
            >
              Log Out
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-2 pb-4 border-t border-gray-200">
            <div className="space-y-1 pt-4">
              {clientMenuItems.map((menu) => (
                <div key={menu.name}>
                  <button
                    onClick={() => toggleMobileSection(menu.name)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-900 bg-gray-50 hover:bg-gray-100"
                  >
                    {menu.name}
                    <svg 
                      className={`w-4 h-4 transition-transform ${mobileOpenSections.includes(menu.name) ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {mobileOpenSections.includes(menu.name) && (
                    <div className="pl-6 bg-white">
                      {menu.items.map((item) => (
                        <Link
                          key={item.name}
                          href={item.href}
                          className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          {item.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}