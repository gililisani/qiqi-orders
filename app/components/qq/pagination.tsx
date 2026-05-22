'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from './button';

/**
 * Pagination — keyboard-friendly, includes "show X per page" selector.
 *
 *   <Pagination
 *     page={1}
 *     totalPages={12}
 *     onPageChange={setPage}
 *     pageSize={25}
 *     onPageSizeChange={setPageSize}
 *     totalItems={287}
 *   />
 */

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  totalItems?: number;
  pageSizeOptions?: number[];
  className?: string;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Build a compact page list with ellipses around the current page. */
function buildPageList(page: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, 'ellipsis', total];
  if (page >= total - 3) {
    return [1, 'ellipsis', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', total];
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  totalItems,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
}: PaginationProps) {
  const pages = buildPageList(page, Math.max(1, totalPages));
  const showPageSize = pageSize !== undefined && onPageSizeChange !== undefined;

  // Summary text — "287 items · page 3 of 12" or "page 3 of 12"
  const summary = (() => {
    const pageBit = `Page ${Math.min(page, totalPages)} of ${totalPages}`;
    if (typeof totalItems === 'number') {
      return `${totalItems.toLocaleString()} item${totalItems === 1 ? '' : 's'} · ${pageBit}`;
    }
    return pageBit;
  })();

  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-2',
        className
      )}
    >
      <div className="text-sm text-muted-foreground">{summary}</div>

      <div className="flex items-center gap-1 flex-wrap">
        {showPageSize && (
          <div className="hidden md:flex items-center gap-2 mr-3 text-sm">
            <span className="text-muted-foreground">Show</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {/* Page numbers are dense — hide them on small screens, prev/next is enough */}
        <div className="hidden sm:flex items-center gap-1">
          {pages.map((p, i) =>
            p === 'ellipsis' ? (
              <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onPageChange(p)}
                className="min-w-[36px] px-2"
              >
                {p}
              </Button>
            )
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
