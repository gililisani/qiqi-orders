'use client';

import { supabase } from '../../../lib/supabaseClient';
import { AdminListPage } from '../../components/admin/AdminListPage';

interface ClassRow {
  id: string;
  name: string;
}

export default function ClassesPage() {
  return (
    <AdminListPage<ClassRow>
      title="Classes"
      description="NetSuite classes used for order classification."
      newUrl="/admin/classes/new"
      newLabel="Add class"
      editUrl={(id) => `/admin/classes/${id}/edit`}
      fetch={() => supabase.from('classes').select('*').order('name')}
      searchPlaceholder="Search classes…"
      filterRow={(c, q) => (c.name ?? '').toLowerCase().includes(q)}
      columns={[
        {
          header: 'Name',
          cell: (c) => <span className="text-sm font-medium">{c.name}</span>,
        },
      ]}
    />
  );
}
