'use client';

import { supabase } from '../../../lib/supabaseClient';
import { AdminListPage } from '../../components/admin/AdminListPage';
import { Badge } from '../../components/qq/badge';

interface Admin {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
}

export default function AdminsPage() {
  return (
    <AdminListPage<Admin>
      title="Admins"
      description="Qiqi staff with access to the Partners Hub admin portal."
      newUrl="/admin/admins/new"
      newLabel="Add admin"
      editUrl={(id) => `/admin/admins/${id}/edit`}
      fetch={() => supabase.from('admins').select('*').order('name')}
      searchPlaceholder="Search admins…"
      filterRow={(a, q) =>
        (a.name ?? '').toLowerCase().includes(q) ||
        (a.email ?? '').toLowerCase().includes(q)
      }
      columns={[
        {
          header: 'Name',
          cell: (a) => (
            <div>
              <div className="text-sm font-medium text-foreground">{a.name || '—'}</div>
              <div className="text-xs text-muted-foreground">{a.email}</div>
            </div>
          ),
        },
        {
          header: 'Status',
          cell: (a) =>
            a.enabled ? (
              <Badge variant="success">Enabled</Badge>
            ) : (
              <Badge variant="muted">Disabled</Badge>
            ),
        },
      ]}
    />
  );
}
