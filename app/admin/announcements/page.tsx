'use client';

import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatters';
import { AdminListPage } from '../../components/admin/AdminListPage';
import { Badge } from '../../components/qq/badge';
import { DropdownMenuItem } from '../../components/qq/dropdown-menu';
import { useToast } from '../../components/ui/ToastProvider';
import { useConfirm } from '../../components/ui/ConfirmProvider';
import { Trash2 } from 'lucide-react';
import { ANNOUNCEMENT_TYPES } from '../../components/admin/AnnouncementForm';

interface AnnouncementRow {
  id: string;
  title: string;
  type: string;
  starts_at: string;
  ends_at: string;
  enabled: boolean;
  product: { item_name: string | null } | null;
}

const TYPE_LABEL = new Map<string, string>(ANNOUNCEMENT_TYPES.map((t) => [t.value, t.label]));

function windowState(a: AnnouncementRow): { label: string; variant: 'success' | 'muted' | 'accent' } {
  const today = new Date().toISOString().slice(0, 10);
  if (!a.enabled) return { label: 'Disabled', variant: 'muted' };
  if (today < a.starts_at) return { label: 'Scheduled', variant: 'accent' };
  if (today > a.ends_at) return { label: 'Ended', variant: 'muted' };
  return { label: 'Live', variant: 'success' };
}

export default function AnnouncementsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const handleDelete = async (a: AnnouncementRow) => {
    const ok = await confirm({
      title: 'Delete announcement?',
      description: `"${a.title}" will be removed permanently.`,
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    const { error } = await supabase.from('announcements').delete().eq('id', a.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Announcement deleted.');
      window.location.reload();
    }
  };

  return (
    <AdminListPage<AnnouncementRow>
      title="Announcements"
      description="What partners see on their homepage — teasers, launches, restocks, offers. Everything expires on schedule."
      newUrl="/admin/announcements/new"
      newLabel="New announcement"
      editUrl={(id) => `/admin/announcements/${id}/edit`}
      fetch={async () =>
        supabase
          .from('announcements')
          .select('id, title, type, starts_at, ends_at, enabled, product:Products(item_name)')
          .order('starts_at', { ascending: false }) as any
      }
      searchPlaceholder="Search by title…"
      filterRow={(a, q) => (a.title ?? '').toLowerCase().includes(q)}
      columns={[
        { header: 'Title', cell: (a) => <span className="font-medium">{a.title}</span> },
        {
          header: 'Type',
          cell: (a) => <span className="text-sm">{TYPE_LABEL.get(a.type) ?? a.type}</span>,
        },
        {
          header: 'Window',
          className: 'hidden md:table-cell',
          cell: (a) => (
            <span className="text-sm text-muted-foreground">
              {formatDate(a.starts_at)} → {formatDate(a.ends_at)}
            </span>
          ),
        },
        {
          header: 'Status',
          cell: (a) => {
            const s = windowState(a);
            return <Badge variant={s.variant}>{s.label}</Badge>;
          },
        },
      ]}
      extraRowActions={(a) => (
        <DropdownMenuItem
          onClick={() => handleDelete(a)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      )}
      emptyTitle="No announcements yet"
      emptyDescription="Create one to light up the partner homepage."
    />
  );
}
