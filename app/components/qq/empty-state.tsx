'use client';

import * as React from 'react';
import { cn } from '../../../lib/utils';

/**
 * EmptyState — the "no data yet" pattern for any list view.
 *
 *   <EmptyState
 *     icon={<Inbox />}
 *     title="No orders yet"
 *     description="When distributors place orders, they'll show up here."
 *     action={<Button>Create order</Button>}
 *   />
 */

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-16 px-6 rounded-md border border-dashed border-border bg-background',
        className
      )}
    >
      {icon && (
        <div className="mb-4 text-muted-foreground [&>svg]:h-10 [&>svg]:w-10">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
