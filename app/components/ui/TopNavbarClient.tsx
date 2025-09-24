"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export default function TopNavbarClient() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("Loading...");
  const closeTimers = useRef<{ main?: any }>({});

  const onEnter = (key: string) => {
    if (closeTimers.current.main) clearTimeout(closeTimers.current.main);
    setOpenMenu(key);
  };

  const onLeave = () => {
    closeTimers.current.main = setTimeout(() => setOpenMenu(null), 150);
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const response = await fetch(`/api/user-profile?userId=${user.id}`);
          const data = await response.json();
          if (data.success && data.user?.name) {
            setUserName(data.user.name);
          } else {
            setUserName("User");
          }
        } else {
          setUserName("Guest");
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        setUserName("User");
      }
    };

    fetchUserData();
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = "/";
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="sticky top-0 z-50 w-full bg-transparent">
      <div className="bg-white border-b border-[#e5e5e5] px-3 py-2">
        <div className="h-14 flex items-center justify-between">
          {/* Left: Logo / Title */}
          <div className="flex items-center gap-3">
            <img src="/QIQI-Logo.svg" alt="Qiqi Logo" className="h-10 w-auto" />
            <span className="text-sm font-semibold tracking-tight">Qiqi Partners Hub</span>
          </div>

          {/* Center: Nav */}
          <nav className="hidden lg:flex items-center gap-6 text-sm whitespace-nowrap">
            <a className="text-gray-700 hover:text-gray-900" href="/client">Dashboard</a>

            {/* Orders */}
            <div className="relative" onMouseEnter={() => onEnter("orders")} onMouseLeave={onLeave}>
              <button className="flex items-center gap-1 text-gray-700 hover:text-gray-900">
                <span>Orders</span>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.093l3.71-3.86a.75.75 0 011.08 1.04l-4.24 4.41a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/>
                </svg>
              </button>
              <div 
                className={`absolute left-0 top-full mt-2 w-56 transition-all duration-200 ${
                  openMenu === "orders" ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
                }`} 
                onMouseEnter={() => onEnter("orders")} 
                onMouseLeave={onLeave}
              >
                <div className="border border-[#e5e5e5] rounded-xl bg-white p-2">
                  <a href="/client/orders/new" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">New Order</a>
                  <a href="/client/orders" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">My Orders</a>
                </div>
              </div>
            </div>
          </nav>

          {/* Right: Feedback, User, Logout, Hamburger */}
          <div className="flex items-center gap-3">
            <button className="hidden lg:inline-flex h-8 items-center rounded-full border border-[#e5e5e5] px-3 text-xs text-gray-700 hover:bg-gray-50 whitespace-nowrap">
              Feedback
            </button>
            {/* Desktop user info */}
            <div className="hidden lg:flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap">
              <span>Hi</span>
              <strong>{userName}</strong>
              <span className="text-gray-300">|</span>
              <button onClick={handleLogout} className="text-red-600 hover:text-red-700">Logout</button>
            </div>
            {/* Mobile logout - always visible */}
            <div className="lg:hidden flex items-center gap-2 text-sm text-gray-700 whitespace-nowrap">
              <button onClick={handleLogout} className="text-red-600 hover:text-red-700">Logout</button>
            </div>
            {/* Hamburger */}
            <button 
              className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded border border-[#e5e5e5]" 
              onClick={() => setMobileOpen(v => !v)} 
              aria-label="Toggle menu"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile panel */}
        {mobileOpen && (
          <div className="lg:hidden border-t border-[#e5e5e5] py-2 text-sm">
            <div className="grid gap-1 py-2">
              <a className="px-2 py-2 rounded hover:bg-gray-50" href="/client">Dashboard</a>
              <details>
                <summary className="px-2 py-2 rounded hover:bg-gray-50 cursor-pointer">Orders</summary>
                <div className="pl-4 py-1 grid">
                  <a className="px-2 py-1 rounded hover:bg-gray-50" href="/client/orders/new">New Order</a>
                  <a className="px-2 py-1 rounded hover:bg-gray-50" href="/client/orders">My Orders</a>
                </div>
              </details>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


