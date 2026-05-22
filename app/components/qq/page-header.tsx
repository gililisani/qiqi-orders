'use client';

import * as React from 'react';
import { cn } from '../../../lib/utils';

/**
 * PageHeader — the consistent top-of-page block used by every admin and client page.
 *
 * Layout:
 *   <PageHeader>
 *     <PageHeader.Title>Orders</PageHeader.Title>
 *     <PageHeader.Description>Manage incoming orders from your distributors.</PageHeader.Description>
 *     <PageHeader.Actions>
 *       <Button>New order</Button>
 *     </PageHeader.Actions>
 *   </PageHeader>
 *
 * Or with the convenience props:
 *   <PageHeader title="Orders" description="..." actions={<Button>New</Button>} />
 */

interface PageHeaderProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
  children,
}: PageHeaderProps) {
  // If children are passed, render them (compound usage); otherwise use props.
  if (children) {
    return <div className={cn('mb-6', className)}>{children}</div>;
  }

  return (
    <div className={cn('mb-6 space-y-2', className)}>
      {breadcrumbs && (
        <div className="text-sm text-muted-foreground">{breadcrumbs}</div>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          {title && (
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
          )}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}

PageHeader.Title = function PageHeaderTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <h1 className={cn('text-2xl font-bold tracking-tight text-foreground', className)}>
      {children}
    </h1>
  );
};

PageHeader.Description = function PageHeaderDescription({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cn('mt-1 text-sm text-muted-foreground', className)}>{children}</p>;
};

PageHeader.Actions = function PageHeaderActions({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex items-center gap-2', className)}>{children}</div>;
};
