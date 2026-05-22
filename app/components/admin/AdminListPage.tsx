'use client';

/**
 * AdminListPage — reusable shell for the small "lookup table" admin pages
 * (Subsidiaries, Locations, Classes, Incoterms, Payment Terms, Support Funds,
 * Admins, etc.). Each entity page is now ~30 lines of config instead of
 * its own 80-150 line copy of the same table boilerplate.
 *
 *   <AdminListPage<Subsidiary>
 *     title="Subsidiaries"
 *     newUrl="/admin/subsidiaries/new"
 *     editUrl={(id) => `/admin/subsidiaries/${id}/edit`}
 *     fetch={async () => supabase.from('subsidiaries').select('*').order('name')}
 *     searchPlaceholder="Search by name…"
 *     filterRow={(s, q) => (s.name ?? '').toLowerCase().includes(q.toLowerCase())}
 *     columns={[
 *       { header: 'Name',    cell: (s) => s.name },
 *       { header: 'Contact', cell: (s) => s.email ?? '—' },
 *     ]}
 *   />
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search, Edit, MoreHorizontal } from 'lucide-react';

import { PageHeader } from '../qq/page-header';
import { Card } from '../qq/card';
import { Input } from '../qq/input';
import { Button } from '../qq/button';
import { Alert, AlertDescription } from '../qq/alert';
import { EmptyState } from '../qq/empty-state';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../qq/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../qq/dropdown-menu';

export interface ListColumn<T> {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Tailwind classes applied to <th> AND <td>. Use for hidden md:table-cell etc. */
  className?: string;
  /** Override for cell only. */
  cellClassName?: string;
  /** Text alignment. */
  align?: 'left' | 'right';
}

export interface AdminListPageProps<T extends { id: string | number }> {
  title: string;
  description?: string;
  newUrl: string;
  newLabel?: string;
  editUrl: (id: T['id']) => string;

  /** Returns { data, error } the same shape Supabase returns.
   *  PromiseLike (not Promise) so the Supabase query builder is accepted
   *  directly without wrapping in an async fn. */
  fetch: () => PromiseLike<{ data: T[] | null; error: any }>;

  /** Client-side filter predicate. Receives the row and the lowercased search term. */
  filterRow?: (row: T, queryLower: string) => boolean;
  searchPlaceholder?: string;

  columns: ListColumn<T>[];

  /** Optional extra row actions appended to the dropdown menu after "Edit". */
  extraRowActions?: (row: T) => ReactNode;

  /** Optional empty-state copy override (when there are zero rows total). */
  emptyTitle?: string;
  emptyDescription?: string;
}

export function AdminListPage<T extends { id: string | number }>({
  title,
  description,
  newUrl,
  newLabel = 'Add new',
  editUrl,
  fetch,
  filterRow,
  searchPlaceholder = 'Search…',
  columns,
  extraRowActions,
  emptyTitle,
  emptyDescription,
}: AdminListPageProps<T>) {
  const router = useRouter();
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await fetch();
        if (cancelled) return;
        if (error) {
          setError(error.message || 'Failed to load.');
          setRows([]);
        } else {
          setRows(data ?? []);
          setError('');
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queryLower = search.trim().toLowerCase();
  const visibleRows =
    !queryLower || !filterRow ? rows : rows.filter((r) => filterRow(r, queryLower));

  const showEmptyAll = !loading && rows.length === 0;
  const showEmptyFiltered = !loading && rows.length > 0 && visibleRows.length === 0;

  return (
    <div className="px-6 py-8">
      <PageHeader
        title={title}
        description={description}
        actions={
          <Link href={newUrl}>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              {newLabel}
            </Button>
          </Link>
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {filterRow && (
        <div className="mb-4 max-w-sm">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      )}

      <Card>
        {showEmptyAll ? (
          <EmptyState
            title={emptyTitle || `No ${title.toLowerCase()} yet`}
            description={emptyDescription || `Create the first one to get started.`}
            action={
              <Link href={newUrl}>
                <Button size="sm">
                  <Plus className="h-4 w-4" />
                  {newLabel}
                </Button>
              </Link>
            }
            className="border-0 shadow-none"
          />
        ) : showEmptyFiltered ? (
          <EmptyState
            title="No results"
            description="Try a different search."
            action={
              <Button size="sm" variant="outline" onClick={() => setSearch('')}>
                Clear search
              </Button>
            }
            className="border-0 shadow-none"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col, i) => (
                  <TableHead
                    key={i}
                    className={`${col.className ?? ''} ${col.align === 'right' ? 'text-right' : ''}`}
                  >
                    {col.header}
                  </TableHead>
                ))}
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + 1}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    Loading…
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row) => (
                  <TableRow
                    key={String(row.id)}
                    className="cursor-pointer"
                    onClick={() => router.push(editUrl(row.id))}
                  >
                    {columns.map((col, i) => (
                      <TableCell
                        key={i}
                        className={`${col.className ?? ''} ${col.cellClassName ?? ''} ${
                          col.align === 'right' ? 'text-right' : ''
                        }`}
                      >
                        {col.cell(row)}
                      </TableCell>
                    ))}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label="Row actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(editUrl(row.id))}>
                            <Edit className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          {extraRowActions?.(row)}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
