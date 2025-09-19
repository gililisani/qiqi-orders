'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Navbar() {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileOpenSections, setMobileOpenSections] = useState<string[]>([]);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

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

  const menuItems = [
    {
      name: 'Orders',
      items: [
        { name: 'All Orders', href: '/admin/orders' }
      ]
    },
    {
      name: 'Partners',
      items: [
        { name: 'Companies', href: '/admin/companies' },
        { name: 'Users', href: '/admin/users' }
      ]
    },
    {
      name: 'Products',
      items: [
        { name: 'Products', href: '/admin/products' },
        { name: 'Categories', href: '/admin/categories' }
      ]
    },
    {
      name: 'Media',
      items: [
        { name: 'Coming Soon', href: '#' }
      ]
    },
    {
      name: 'System',
      items: [
        { name: 'Support Funds', href: '/admin/support-funds' },
        { name: 'Locations', href: '/admin/locations' },
        { name: 'Classes', href: '/admin/classes' },
        { name: 'Subsidiaries', href: '/admin/subsidiaries' },
        { name: 'Incoterms', href: '/admin/incoterms' },
        { name: 'Payment Terms', href: '/admin/payment-terms' },
        { name: 'Admins', href: '/admin/admins' },
        { name: 'NetSuite', href: '/admin/netsuite' }
      ]
    }
  ];

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 px-6 py-2">
      <div className="flex items-center justify-between">
        {/* Logo and Brand */}
        <a href="/admin" className="flex items-center space-x-3 hover:opacity-90 transition">
          <Image src="/logo.png" alt="Qiqi Logo" width={80} height={32} />
          <span className="text-lg font-semibold tracking-wide">Partners Hub</span>
        </a>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center space-x-1">
          {menuItems.map((menu) => (
            <div 
              key={menu.name} 
              className="relative"
              onMouseEnter={() => handleMouseEnter(menu.name)}
              onMouseLeave={handleMouseLeave}
            >
              <button
                className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded transition-colors"
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
                <div className="absolute top-full left-0 w-48 bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50">
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

        {/* Right Side - Logout and Mobile Menu */}
        <div className="flex items-center space-x-3">
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
            className="md:hidden p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded"
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
            {menuItems.map((menu) => (
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
  );
}
