'use client';

/**
 * AdminFormShell — page chrome for all admin create/edit forms.
 *
 *   <AdminFormShell
 *     title="Edit subsidiary"
 *     backHref="/admin/subsidiaries"
 *     saving={saving}
 *     error={error}
 *     onSubmit={handleSubmit}
 *     onCancel={() => router.push('/admin/subsidiaries')}
 *     submitLabel="Save changes"
 *   >
 *     <FormField label="Name" required>
 *       <Input value={...} onChange={...} />
 *     </FormField>
 *     …more fields…
 *   </AdminFormShell>
 *
 * Renders: back link → PageHeader (title + description) → Alert if error →
 * Card with form children → Cancel + Save bar at the bottom.
 */

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { PageHeader } from '../qq/page-header';
import { Card, CardContent } from '../qq/card';
import { Button } from '../qq/button';
import { Alert, AlertDescription } from '../qq/alert';

interface AdminFormShellProps {
  title: string;
  description?: string;
  backHref: string;
  backLabel?: string;
  saving?: boolean;
  error?: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  /** Show only the form body without Save/Cancel — for view-only pages. */
  hideActions?: boolean;
  /** Render extra actions on the right of the page header (e.g. Delete). */
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

export function AdminFormShell({
  title,
  description,
  backHref,
  backLabel = 'Back',
  saving = false,
  error,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  hideActions = false,
  headerActions,
  children,
}: AdminFormShellProps) {
  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">
      <Link
        href={backHref}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        {backLabel}
      </Link>

      <PageHeader title={title} description={description} actions={headerActions} />

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate>
        <Card>
          <CardContent className="pt-6 space-y-5">{children}</CardContent>
        </Card>

        {!hideActions && (
          <div className="mt-4 flex items-center justify-end gap-2">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
                {cancelLabel}
              </Button>
            )}
            <Button type="submit" loading={saving}>
              {saving ? 'Saving…' : submitLabel}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
