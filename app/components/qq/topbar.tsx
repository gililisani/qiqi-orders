'use client';

/**
 * Topbar — bar above the page content.
 *
 *   <Topbar
 *     onToggleSidebar={...}
 *     left={<Breadcrumbs ... />}
 *     right={<UserMenu />}
 *   />
 */

import * as React from 'react';
import { Menu } from 'lucide-react';
import { Button } from './button';
import { cn } from '../../../lib/utils';

interface TopbarProps {
  /** Called when the hamburger or collapse button is clicked. */
  onToggleSidebar?: () => void;
  /** Show the mobile hamburger; defaults to true on small screens, hidden on large. */
  showHamburger?: boolean;
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

export function Topbar({
  onToggleSidebar,
  showHamburger = true,
  left,
  right,
  className,
}: TopbarProps) {
  return (
    <header
      className={cn(
        'h-14 bg-card border-b border-border flex items-center px-4 gap-3',
        className
      )}
    >
      {showHamburger && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}
      <div className="flex-1 min-w-0">{left}</div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  );
}

/** Convenience: tiny breadcrumb component for the topbar `left` slot. */
interface BreadcrumbsProps {
  items: Array<{ label: string; href?: string }>;
  className?: string;
}

export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  return (
    <nav aria-label="breadcrumb" className={cn('flex items-center text-sm', className)}>
      {items.map((it, i) => (
        <React.Fragment key={`${it.label}-${i}`}>
          {i > 0 && <span className="mx-2 text-muted-foreground">/</span>}
          {it.href && i < items.length - 1 ? (
            <a href={it.href} className="text-muted-foreground hover:text-foreground transition-colors">
              {it.label}
            </a>
          ) : (
            <span className={i === items.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground'}>
              {it.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
