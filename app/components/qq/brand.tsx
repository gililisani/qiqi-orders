'use client';

/**
 * Brand — the logo + product name + sidebar toggle block.
 *
 * Lives at the top-left of the AppShell, inside the topbar. It is fully
 * decoupled from the Sidebar: collapsing the sidebar does NOT change the
 * brand block's width or contents.
 *
 *   <Brand
 *     title="Partners Hub"
 *     onToggleSidebar={() => setCollapsed(c => !c)}
 *     sidebarCollapsed={collapsed}
 *   />
 *
 * Width is fixed (matching the expanded sidebar width) so the topbar
 * remains stable when the sidebar collapses underneath it.
 */

import * as React from 'react';
import Link from 'next/link';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface BrandProps {
  title: string;
  /** Optional explicit image URL for the logo. */
  logoSrc?: string;
  /** Optional fully-custom logo node (overrides logoSrc). */
  logo?: React.ReactNode;
  /** Where the logo links to. */
  href?: string;
  /** Click handler for the collapse/expand button. */
  onToggleSidebar?: () => void;
  /** Whether the sidebar is currently collapsed (controls the toggle icon direction). */
  sidebarCollapsed?: boolean;
  className?: string;
}

export function Brand({
  title,
  logoSrc,
  logo,
  href = '#',
  onToggleSidebar,
  sidebarCollapsed,
  className,
}: BrandProps) {
  const logoEl =
    logo ||
    (logoSrc ? (
      // Height-constrained, width auto so wordmark logos render at their
      // natural aspect ratio (icon-only logos still look square).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoSrc}
        alt={title}
        className="h-6 w-auto max-w-[100px] object-contain flex-shrink-0"
      />
    ) : (
      <div className="h-7 w-7 rounded bg-foreground text-background flex items-center justify-center text-[11px] font-bold flex-shrink-0">
        Q
      </div>
    ));

  return (
    <div
      className={cn(
        // Fixed width matching the expanded sidebar so the two visually align
        // when the sidebar is expanded; brand stays this width when the sidebar
        // collapses underneath.
        'h-14 w-56 border-r border-border flex items-center justify-between gap-2 px-3 flex-shrink-0',
        className
      )}
    >
      <Link href={href} className="flex items-center gap-2 min-w-0">
        {logoEl}
        <span className="text-sm font-semibold text-foreground truncate">{title}</span>
      </Link>

      {onToggleSidebar && (
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0 hidden lg:inline-flex"
        >
          {sidebarCollapsed ? (
            <ChevronsRight className="h-4 w-4" />
          ) : (
            <ChevronsLeft className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}
