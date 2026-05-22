'use client';

/**
 * AppShell — the standard layout for every admin/client page.
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ Brand        │ topbar content │ user menu   │  ← full-width topbar
 *   ├──────────────┼──────────────────────────────┤
 *   │              │                              │
 *   │   sidebar    │       page content           │
 *   │              │                              │
 *   └──────────────┴──────────────────────────────┘
 *
 * The brand block lives at the left of the topbar; it is NOT part of the
 * sidebar. Collapsing the sidebar narrows only the sidebar — the brand
 * block stays at its fixed width.
 *
 *   <AppShell
 *     topbar={<Topbar brand={<Brand ... />} left={...} right={...} />}
 *     sidebar={<Sidebar collapsed={...}>...nav...</Sidebar>}
 *   >
 *     {pageContent}
 *   </AppShell>
 */

import * as React from 'react';
import { cn } from '../../../lib/utils';

interface AppShellProps {
  topbar?: React.ReactNode;
  sidebar: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

export function AppShell({
  topbar,
  sidebar,
  className,
  contentClassName,
  children,
}: AppShellProps) {
  return (
    <div className={cn('h-screen flex flex-col bg-background overflow-hidden', className)}>
      {topbar}
      <div className="flex-1 flex overflow-hidden">
        <aside className="hidden lg:flex flex-shrink-0">{sidebar}</aside>
        <main className={cn('flex-1 overflow-y-auto min-w-0', contentClassName)}>
          {children}
        </main>
      </div>
    </div>
  );
}
