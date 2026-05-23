'use client';

import Link from 'next/link';
import { Eye, Trash2 } from 'lucide-react';

import { supabase } from '../../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { AdminListPage } from '../../../components/admin/AdminListPage';
import { DropdownMenuItem } from '../../../components/qq/dropdown-menu';
import { useToast } from '../../../components/ui/ToastProvider';
import { useConfirm } from '../../../components/ui/ConfirmProvider';

interface StandaloneSLI {
  id: string;
  sli_number: number;
  created_at: string;
  company_id: string | null;
  consignee_name: string;
}

async function fetchSLIs(): Promise<{ data: StandaloneSLI[] | null; error: any }> {
  const { data, error } = await supabase
    .from('standalone_slis')
    .select('id, sli_number, created_at, company_id, consignee_name')
    .order('created_at', { ascending: false });
  return { data: data as StandaloneSLI[] | null, error };
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function SLIDocumentsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const handleDelete = async (sli: StandaloneSLI) => {
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
    <AdminListPage<StandaloneSLI>
      title="SLI documents"
      description="Standalone Shipper's Letter of Instruction documents."
      newUrl="/admin/sli/create"
      newLabel="Create SLI"
      editUrl={(id) => `/admin/sli/${id}/edit`}
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
            <Link href={`/admin/sli/${s.id}/preview`}>
              <Eye className="h-4 w-4 mr-2" /> View
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleDelete(s)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" /> Delete
          </DropdownMenuItem>
        </>
      )}
    />
  );
}
