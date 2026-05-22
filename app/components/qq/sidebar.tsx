'use client';

/**
 * Sidebar — collapsible left navigation.
 *
 *   <Sidebar collapsed={collapsed}>
 *     <Sidebar.Header>...</Sidebar.Header>
 *     <Sidebar.Nav>
 *       <Sidebar.Group label="Workspace">
 *         <Sidebar.Item icon={<Inbox/>} href="/admin/orders" active>Orders</Sidebar.Item>
 *         ...
 *       </Sidebar.Group>
 *     </Sidebar.Nav>
 *     <Sidebar.Footer>...</Sidebar.Footer>
 *   </Sidebar>
 */

import * as React from 'react';
import Link from 'next/link';
import { cn } from '../../../lib/utils';

interface SidebarProps {
  collapsed?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Sidebar({ collapsed = false, className, children }: SidebarProps) {
  return (
    <SidebarContext.Provider value={{ collapsed }}>
      <nav
        className={cn(
          'flex flex-col h-full bg-card border-r border-border',
          'transition-[width] duration-200',
          collapsed ? 'w-14' : 'w-56',
          className
        )}
        aria-label="Sidebar"
      >
        {children}
      </nav>
    </SidebarContext.Provider>
  );
}

const SidebarContext = React.createContext<{ collapsed: boolean }>({ collapsed: false });

Sidebar.Header = function SidebarHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('h-14 flex items-center px-3 border-b border-border', className)}>
      {children}
    </div>
  );
};

Sidebar.Nav = function SidebarNav({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex-1 overflow-y-auto py-3 px-2 space-y-4', className)}>
      {children}
    </div>
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

Sidebar.Item = function SidebarItem({ href, icon, active, badge, className, children }: SidebarItemProps) {
  const { collapsed } = React.useContext(SidebarContext);
  return (
    <Link
      href={href}
      title={collapsed && typeof children === 'string' ? children : undefined}
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
};

Sidebar.Footer = function SidebarFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('border-t border-border p-3', className)}>
      {children}
    </div>
  );
};
