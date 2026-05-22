'use client';

/**
 * AppShell — the standard layout for every admin/client page.
 *
 *   <AppShell
 *     sidebar={<Sidebar>...</Sidebar>}
 *     topbar={<Topbar ... />}
 *   >
 *     {pageContent}
 *   </AppShell>
 *
 * Responsive behavior:
 *  - <lg (1024px): sidebar is hidden, accessed via a Sheet/drawer (parent
 *                  passes the trigger via topbar.onToggleSidebar and renders
 *                  the drawer itself — keeps this component dumb).
 *  - lg+: sidebar shown inline; parent can swap a collapsed/expanded version
 *         via the same Sidebar component's `collapsed` prop.
 */

import * as React from 'react';
import { cn } from '../../../lib/utils';

interface AppShellProps {
  sidebar: React.ReactNode;
  topbar?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

export function AppShell({ sidebar, topbar, className, contentClassName, children }: AppShellProps) {
  return (
    <div className={cn('h-screen flex bg-background overflow-hidden', className)}>
      {/* Sidebar: visible on lg+ only; mobile uses Sheet via topbar hamburger */}
      <aside className="hidden lg:flex flex-shrink-0">{sidebar}</aside>

      <div className="flex-1 flex flex-col min-w-0">
        {topbar}
        <main className={cn('flex-1 overflow-y-auto', contentClassName)}>{children}</main>
      </div>
    </div>
  );
}
