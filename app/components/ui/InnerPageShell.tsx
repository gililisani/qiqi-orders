"use client";

import React from "react";

interface Crumb {
  label: string;
  href?: string;
}

export interface InnerPageShellProps {
  title: string;
  breadcrumbs?: Crumb[];
  actions?: React.ReactNode;
  footerActions?: React.ReactNode;
  children: React.ReactNode;
}

export default function InnerPageShell({ title, breadcrumbs = [], actions, footerActions, children }: InnerPageShellProps) {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-5">
        {breadcrumbs.length > 0 && (
          <nav className="text-sm text-gray-500 mb-2" aria-label="Breadcrumb">
            <ol className="flex flex-wrap gap-2">
              {breadcrumbs.map((c, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  {c.href ? (
                    <a href={c.href} className="hover:text-gray-900">{c.label}</a>
                  ) : (
                    <span className="text-gray-700">{c.label}</span>
                  )}
                  {idx < breadcrumbs.length - 1 && <span>/</span>}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h1>
          {actions && <div className="shrink-0 flex gap-2">{actions}</div>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 pb-12">
        {children}
      </div>

      {footerActions && (
        <div className="sticky bottom-0 left-0 right-0 mt-8 border-t border-gray-100 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60">
          <div className="max-w-7xl mx-auto px-4 py-3 flex justify-end gap-2">
            {footerActions}
          </div>
        </div>
      )}
    </div>
  );
}


