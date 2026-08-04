'use client';

import Link from 'next/link';
import { Eye, ExternalLink, Settings, Trash2 } from 'lucide-react';

import { supabase } from '../../../../lib/supabaseClient';
import { formatDate } from '../../../../lib/formatters';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { AdminListPage } from '../../../components/admin/AdminListPage';
import { Badge } from '../../../components/qq/badge';
import { Button } from '../../../components/qq/button';
import { DropdownMenuItem } from '../../../components/qq/dropdown-menu';
import { useToast } from '../../../components/ui/ToastProvider';
import { useConfirm } from '../../../components/ui/ConfirmProvider';

/** One merged list: standalone SLIs + order SLIs (numbered since 2026-08). */
interface SLIListRow {
  id: string;
  sli_number: number;
  created_at: string;
  type: 'standalone' | 'order';
  consignee_name: string;
  /** Set for order SLIs — row click and actions route to the order. */
  order_id?: string;
}

async function fetchSLIs(): Promise<{ data: SLIListRow[] | null; error: any }> {
  const [standalone, order] = await Promise.all([
    supabase
      .from('standalone_slis')
      .select('id, sli_number, created_at, consignee_name'),
    supabase
      .from('slis')
      .select('id, sli_number, created_at, order_id, orders(companies(company_name))'),
  ]);

  const error = standalone.error || order.error;
  if (error) return { data: null, error };

  const rows: SLIListRow[] = [
    ...(standalone.data || []).map((s: any) => ({
      id: s.id,
      sli_number: s.sli_number,
      created_at: s.created_at,
      type: 'standalone' as const,
      consignee_name: s.consignee_name || '',
    })),
    ...(order.data || []).map((s: any) => ({
      id: s.id,
      sli_number: s.sli_number,
      created_at: s.created_at,
      type: 'order' as const,
      consignee_name: s.orders?.companies?.company_name || '',
      order_id: s.order_id,
    })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return { data: rows, error: null };
}

export default function SLIDocumentsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const handleDelete = async (sli: SLIListRow) => {
    const ok = await confirm({
      title: 'Delete SLI?',
      description: `Permanently delete SLI #${sli.sli_number} (${sli.consignee_name}). This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;

    try {
      const res = await fetchWithAuth(`/api/sli/standalone/${sli.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete SLI.');
      toast.success('SLI deleted.');
      // hard reload list — AdminListPage doesn't expose refetch
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete SLI.');
    }
  };

  return (
    <AdminListPage<SLIListRow>
      title="SLI documents"
      description="All Shipper's Letter of Instruction documents — standalone and order-based."
      newUrl="/admin/sli/create"
      newLabel="Create SLI"
      extraHeaderActions={
        <Link href="/admin/sli/settings">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4" />
            Settings
          </Button>
        </Link>
      }
      // Row click opens the DOCUMENT (owner QA feedback 2026-08-03);
      // Edit stays in the dropdown — for order SLIs editing happens on the
      // order page (the SLI modal lives there).
      rowClickUrl={(id, row) =>
        row.type === 'order'
          ? `/admin/orders/${row.order_id}/sli-preview`
          : `/admin/sli/${id}/preview`
      }
      editUrl={(id, row) =>
        row?.type === 'order' ? `/admin/orders/${row.order_id}` : `/admin/sli/${id}/edit`
      }
      fetch={fetchSLIs}
      searchPlaceholder="Search by SLI number or consignee…"
      filterRow={(s, q) =>
        s.sli_number.toString().includes(q) ||
        (s.consignee_name ?? '').toLowerCase().includes(q)
      }
      columns={[
        {
          header: 'SLI #',
          cell: (s) => <span className="font-mono text-sm">{s.sli_number}</span>,
        },
        {
          header: 'Type',
          cell: (s) =>
            s.type === 'order' ? (
              <Badge variant="accent">Order</Badge>
            ) : (
              <Badge variant="outline">Standalone</Badge>
            ),
        },
        {
          header: 'Created',
          className: 'hidden md:table-cell',
          cell: (s) => <span className="text-sm">{formatDate(s.created_at)}</span>,
        },
        {
          header: 'Consignee',
          cell: (s) => (
            <span className="text-sm text-foreground">{s.consignee_name || '—'}</span>
          ),
        },
      ]}
      extraRowActions={(s) => (
        <>
          <DropdownMenuItem asChild>
            <Link
              href={
                s.type === 'order'
                  ? `/admin/orders/${s.order_id}/sli-preview`
                  : `/admin/sli/${s.id}/preview`
              }
            >
              <Eye className="h-4 w-4 mr-2" /> View
            </Link>
          </DropdownMenuItem>
          {s.type === 'order' ? (
            <DropdownMenuItem asChild>
              <Link href={`/admin/orders/${s.order_id}`}>
                <ExternalLink className="h-4 w-4 mr-2" /> Open order
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => handleDelete(s)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
          )}
        </>
      )}
    />
  );
}
