"use client";

import React from "react";

export default function TopNavbar() {
  return (
    <div className="w-full border-b border-[#e5e5e5] bg-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="h-14 flex items-center justify-between">
          {/* Left: Logo / Title */}
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded bg-black" aria-hidden />
            <span className="text-sm font-semibold tracking-tight">QiQi Admin</span>
          </div>

          {/* Center: Nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {/* Dashboard */}
            <a className="text-gray-700 hover:text-gray-900" href="#">Dashboard</a>

            {/* Orders with submenu */}
            <div className="relative group">
              <button className="flex items-center gap-1 text-gray-700 hover:text-gray-900">
                <span>Orders</span>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.093l3.71-3.86a.75.75 0 011.08 1.04l-4.24 4.41a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
              </button>
              {/* Level 1 dropdown */}
              <div className="pointer-events-none absolute left-0 top-full mt-2 w-56 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-200">
                <div className="border border-[#e5e5e5] rounded-xl bg-white p-2">
                  <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">All Orders</a>
                  <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">New Order</a>
                  {/* Nested submenu trigger */}
                  <div className="relative group/sub">
                    <button className="w-full flex items-center justify-between rounded px-3 py-2 text-gray-700 hover:bg-gray-50">
                      <span>Status</span>
                      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.21 5.23a.75.75 0 011.06-.02l4.41 4.24a.75.75 0 010 1.08l-4.41 4.24a.75.75 0 11-1.04-1.08L11.09 10 7.23 6.29a.75.75 0 01-.02-1.06z" clipRule="evenodd"/></svg>
                    </button>
                    {/* Level 2 dropdown */}
                    <div className="pointer-events-none absolute left-full top-0 ml-2 w-48 opacity-0 translate-y-1 group-hover/sub:opacity-100 group-hover/sub:translate-y-0 group-hover/sub:pointer-events-auto transition-all duration-200">
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

            {/* Products with submenu */}
            <div className="relative group">
              <button className="flex items-center gap-1 text-gray-700 hover:text-gray-900">
                <span>Products</span>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.093l3.71-3.86a.75.75 0 011.08 1.04l-4.24 4.41a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
              </button>
              <div className="pointer-events-none absolute left-0 top-full mt-2 w-56 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-200">
                <div className="border border-[#e5e5e5] rounded-xl bg-white p-2">
                  <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">All Products</a>
                  <a href="#" className="block rounded px-3 py-2 text-gray-700 hover:bg-gray-50">New Product</a>
                </div>
              </div>
            </div>

            {/* System */}
            <div className="relative group">
              <button className="flex items-center gap-1 text-gray-700 hover:text-gray-900">
                <span>System</span>
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.093l3.71-3.86a.75.75 0 011.08 1.04l-4.24 4.41a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
              </button>
              <div className="pointer-events-none absolute left-0 top-full mt-2 w-64 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto transition-all duration-200">
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

          {/* Right: profile cluster */}
          <div className="flex items-center gap-3">
            <button className="hidden md:inline-flex h-8 items-center rounded-full border border-[#e5e5e5] px-3 text-xs text-gray-700 hover:bg-gray-50">Quick Actions</button>
            <div className="h-8 w-8 rounded-full bg-gray-200" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
}


