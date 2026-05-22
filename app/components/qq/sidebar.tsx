'use client';

/**
 * Sidebar — collapsible left navigation.
 *
 * Usage:
 *   <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)}>
 *     <Sidebar.Brand logoSrc="/logo.svg" title="Partners Hub" />
 *     <Sidebar.Nav>
 *       <Sidebar.Group label="Workspace">
 *         <Sidebar.Item icon={<Inbox/>} href="/admin/orders" active>Orders</Sidebar.Item>
 *       </Sidebar.Group>
 *     </Sidebar.Nav>
 *     <Sidebar.Footer>...</Sidebar.Footer>
 *   </Sidebar>
 *
 * When `collapsed` is true:
 *  - Sidebar width shrinks from 14rem to 4rem
 *  - Item labels hide, icons stay centered
 *  - Hovering an item shows the label as a tooltip
 *  - The brand block keeps the logo at the same visual size; only the
 *    text wordmark beside it disappears
 */

import * as React from 'react';
import Link from 'next/link';
import { cn } from '../../../lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';

interface SidebarProps {
  collapsed?: boolean;
  /** Called when the toggle button in the brand block is clicked. */
  onToggle?: () => void;
  className?: string;
  children: React.ReactNode;
}

const SidebarContext = React.createContext<{ collapsed: boolean; onToggle?: () => void }>({
  collapsed: false,
});

export function Sidebar({ collapsed = false, onToggle, className, children }: SidebarProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <SidebarContext.Provider value={{ collapsed, onToggle }}>
        <nav
          className={cn(
            'flex flex-col h-full bg-card border-r border-border',
            'transition-[width] duration-200 ease-out',
            collapsed ? 'w-16' : 'w-56',
            className
          )}
          aria-label="Sidebar"
        >
          {children}
        </nav>
      </SidebarContext.Provider>
    </TooltipProvider>
  );
}

// ----------------------------------------------------------------------------
// Nav / Group / Item
// (Brand block lives in the Topbar via the standalone <Brand /> component —
// it is intentionally NOT part of the Sidebar so it doesn't collapse along
// with the menu.)
// ----------------------------------------------------------------------------
Sidebar.Nav = function SidebarNav({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex-1 overflow-y-auto py-3 px-2 space-y-4', className)}>{children}</div>
  );
};

Sidebar.Group = function SidebarGroup({
  label,
  className,
  children,
}: {
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { collapsed } = React.useContext(SidebarContext);
  return (
    <div className={cn('space-y-0.5', className)}>
      {label && !collapsed && (
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      )}
      {label && collapsed && (
        <div className="px-2 pb-1">
          <div className="h-px bg-border" />
        </div>
      )}
      {children}
    </div>
  );
};

interface SidebarItemProps {
  href: string;
  icon?: React.ReactNode;
  active?: boolean;
  badge?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

Sidebar.Item = function SidebarItem({
  href,
  icon,
  active,
  badge,
  className,
  children,
}: SidebarItemProps) {
  const { collapsed } = React.useContext(SidebarContext);

  const link = (
    <Link
      href={href}
      className={cn(
        'group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
        active
          ? 'bg-secondary text-foreground font-medium'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        collapsed && 'justify-center',
        className
      )}
    >
      {icon && (
        <span className={cn('flex-shrink-0 [&>svg]:h-4 [&>svg]:w-4', active && 'text-foreground')}>
          {icon}
        </span>
      )}
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{children}</span>
          {badge && <span className="ml-auto">{badge}</span>}
        </>
      )}
    </Link>
  );

  // When collapsed, wrap in a tooltip showing the label on hover.
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{children}</TooltipContent>
      </Tooltip>
    );
  }
  return link;
};

Sidebar.Footer = function SidebarFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('border-t border-border p-3', className)}>{children}</div>;
};
