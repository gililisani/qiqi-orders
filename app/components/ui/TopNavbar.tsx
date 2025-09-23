"use client";

import React, { useState, useRef } from "react";

export default function TopNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const closeTimers = useRef<{ main?: any; sub?: any }>({});

  const onEnter = (key: string) => {
    if (closeTimers.current.main) clearTimeout(closeTimers.current.main);
    setOpenMenu(key);
  };
  const onLeave = () => {
    closeTimers.current.main = setTimeout(() => setOpenMenu(null), 150);
  };
  const onEnterSub = (key: string) => {
    if (closeTimers.current.sub) clearTimeout(closeTimers.current.sub);
    setOpenSub(key);
  };
  const onLeaveSub = () => {
    closeTimers.current.sub = setTimeout(() => setOpenSub(null), 150);
  };

  return (
    <div className="sticky top-0 z-50 w-full bg-transparent">
      <div className="max-w-7xl mx-auto px-4 py-2">
        <div className="border border-[#e5e5e5] rounded-xl bg-white px-3">
          <div className="h-14 flex items-center justify-between">
            {/* Left: Logo / Title */}
            <div className="flex items-center gap-3">
              <svg className="h-10 w-10" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="100" height="100" rx="20" fill="#000000"/>
                <text x="50" y="60" textAnchor="middle" fill="white" fontSize="32" fontWeight="bold" fontFamily="Arial, sans-serif">Q</text>
              </svg>
              <span className="text-sm font-semibold tracking-tight">Qiqi Partners Hub</span>
            </div>

            {/* Center: Nav */}
            <nav className="hidden md:flex items-center gap-6 text-sm">
              <a className="text-gray-700 hover:text-gray-900" href="#">Dashboard</a>

              {/* Orders */}
              <div className="relative" onMouseEnter={() => onEnter("orders")} onMouseLeave={onLeave}>
                <button className="flex items-center gap-1 text-gray-700 hover:text-gray-900">
                  <span>Orders</span>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.093l3.71-3.86a.75.75 0 011.08 1.04l-4.24 4.41a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
                </button>
                <div className={`absolute left-0 top-full mt-2 w-56 transition-all duration-200 ${openMenu === "orders" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`} onMouseEnter={() => onEnter("orders")} onMouseLeave={onLeave}>
                    <div className="border border-[#e5e5e5] rounded-xl bg-white p-2">
                      <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">All Orders</a>
                      <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">New Order</a>
                      <div className="relative" onMouseEnter={() => onEnterSub("status")} onMouseLeave={onLeaveSub}>
                        <button className="w-full flex items-center justify-between rounded px-3 py-2 text-gray-700 hover:bg-gray-50">
                          <span>Status</span>
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.21 5.23a.75.75 0 011.06-.02l4.41 4.24a.75.75 0 010 1.08l-4.41 4.24a.75.75 0 11-1.04-1.08L11.09 10 7.23 6.29a.75.75 0 01-.02-1.06z" clipRule="evenodd"/></svg>
                        </button>
                        <div className={`absolute left-full top-0 ml-2 w-48 transition-all duration-200 ${openSub === "status" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`}>
                            <div className="border border-[#e5e5e5] rounded-xl bg-white p-2">
                              <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">Open</a>
                              <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">In Process</a>
                              <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">Done</a>
                              <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">Cancelled</a>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
              </div>

              {/* Products */}
              <div className="relative" onMouseEnter={() => onEnter("products")} onMouseLeave={onLeave}>
                <button className="flex items-center gap-1 text-gray-700 hover:text-gray-900">
                  <span>Products</span>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.093l3.71-3.86a.75.75 0 011.08 1.04l-4.24 4.41a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
                </button>
                <div className={`absolute left-0 top-full mt-2 w-56 transition-all duration-200 ${openMenu === "products" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`} onMouseEnter={() => onEnter("products")} onMouseLeave={onLeave}>
                    <div className="border border-[#e5e5e5] rounded-xl bg-white p-2">
                      <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">All Products</a>
                      <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">New Product</a>
                    </div>
                  </div>
              </div>

              {/* System */}
              <div className="relative" onMouseEnter={() => onEnter("system")} onMouseLeave={onLeave}>
                <button className="flex items-center gap-1 text-gray-700 hover:text-gray-900">
                  <span>System</span>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.093l3.71-3.86a.75.75 0 011.08 1.04l-4.24 4.41a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
                </button>
                <div className={`absolute left-0 top-full mt-2 w-64 transition-all duration-200 ${openMenu === "system" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`} onMouseEnter={() => onEnter("system")} onMouseLeave={onLeave}>
                    <div className="border border-[#e5e5e5] rounded-xl bg-white p-2 grid grid-cols-1">
                      <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">Companies</a>
                      <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">Users</a>
                      <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">Products</a>
                      <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">Categories</a>
                      <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">Subsidiaries</a>
                      <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">Support Funds</a>
                      <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">Incoterms</a>
                      <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">Payment Terms</a>
                    </div>
                  </div>
              </div>
            </nav>

            {/* Right: user + actions */}
            <div className="flex items-center gap-3">
              <button className="hidden md:inline-flex h-8 items-center rounded-full border border-[#e5e5e5] px-3 text-xs text-gray-700 hover:bg-gray-50">Feedback</button>
              <div className="hidden md:flex items-center gap-2 text-sm text-gray-700">
                <span>Hi</span>
                <strong>John Smith</strong>
                <span className="text-gray-300">|</span>
                <button className="text-red-600 hover:text-red-700">Logout</button>
              </div>
              {/* Hamburger */}
              <button className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded border border-[#e5e5e5]" onClick={() => setMobileOpen(v => !v)} aria-label="Toggle menu">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
              </button>
            </div>
          </div>

          {/* Mobile panel */}
          {mobileOpen && (
            <div className="md:hidden border-t border-[#e5e5e5] py-2 text-sm">
              <div className="grid gap-1 py-2">
                <a className="px-2 py-2 rounded hover:bg-gray-50" href="#">Dashboard</a>
                <details>
                  <summary className="px-2 py-2 rounded hover:bg-gray-50 cursor-pointer">Orders</summary>
                  <div className="pl-4 py-1 grid">
                    <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">All Orders</a>
                    <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">New Order</a>
                    <details>
                      <summary className="px-2 py-1 rounded hover:bg-gray-50 cursor-pointer">Status</summary>
                      <div className="pl-4 py-1 grid">
                        <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">Open</a>
                        <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">In Process</a>
                        <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">Done</a>
                        <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">Cancelled</a>
                      </div>
                    </details>
                  </div>
                </details>
                <details>
                  <summary className="px-2 py-2 rounded hover:bg-gray-50 cursor-pointer">Products</summary>
                  <div className="pl-4 py-1 grid">
                    <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">All Products</a>
                    <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">New Product</a>
                  </div>
                </details>
                <details>
                  <summary className="px-2 py-2 rounded hover:bg-gray-50 cursor-pointer">System</summary>
                  <div className="pl-4 py-1 grid">
                    <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">Companies</a>
                    <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">Users</a>
                    <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">Products</a>
                    <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">Categories</a>
                    <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">Subsidiaries</a>
                    <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">Support Funds</a>
                    <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">Incoterms</a>
                    <a className="px-2 py-1 rounded hover:bg-gray-50" href="#">Payment Terms</a>
                  </div>
                </details>
                <div className="px-2 py-2 text-gray-700">Hi <strong>John Smith</strong> · <button className="text-red-600 hover:text-red-700">Logout</button></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


