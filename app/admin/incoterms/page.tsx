'use client';

import { supabase } from '../../../lib/supabaseClient';
import { AdminListPage } from '../../components/admin/AdminListPage';

interface Incoterm {
  id: number;
  name: string;
  description: string | null;
}

export default function IncotermsPage() {
  return (
    <AdminListPage<Incoterm>
      title="Incoterms"
      description="International trade terms used on order shipping documents."
      newUrl="/admin/incoterms/new"
      newLabel="Add incoterm"
      editUrl={(id) => `/admin/incoterms/${id}/edit`}
      fetch={() => supabase.from('incoterms').select('*').order('name')}
      searchPlaceholder="Search incoterms…"
      filterRow={(i, q) =>
        (i.name ?? '').toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q)
      }
      columns={[
        {
          header: 'Name',
          cell: (i) => <span className="text-sm font-medium">{i.name}</span>,
        },
        {
          header: 'Description',
          className: 'hidden md:table-cell',
          cell: (i) =>
            i.description ? (
              <span className="text-sm text-muted-foreground">{i.description}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
      ]}
    />
  );
}
