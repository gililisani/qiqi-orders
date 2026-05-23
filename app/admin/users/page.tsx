'use client';

import { supabase } from '../../../lib/supabaseClient';
import { AdminListPage } from '../../components/admin/AdminListPage';
import { Badge } from '../../components/qq/badge';

interface Client {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  company_id: string;
  created_at: string;
  company?: { company_name: string; netsuite_number: string };
}

export default function UsersPage() {
  return (
    <AdminListPage<Client>
      title="Users"
      description="Client users with access to the partner portal."
      newUrl="/admin/users/new"
      newLabel="Add user"
      editUrl={(id) => `/admin/users/${id}`}
      fetch={() =>
        supabase
          .from('clients')
          .select('*, company:companies(company_name, netsuite_number)')
          .order('name')
      }
      searchPlaceholder="Search by name, email, or company…"
      filterRow={(c, q) =>
        (c.name ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.company?.company_name ?? '').toLowerCase().includes(q)
      }
      columns={[
        {
          header: 'User',
          cell: (c) => (
            <div>
              <div className="text-sm font-medium text-foreground">{c.name || '—'}</div>
              <div className="text-xs text-muted-foreground">{c.email}</div>
            </div>
          ),
        },
        {
          header: 'Company',
          className: 'hidden md:table-cell',
          cell: (c) => (
            <div>
              <div className="text-sm">{c.company?.company_name || '—'}</div>
              {c.company?.netsuite_number && (
                <div className="text-xs text-muted-foreground font-mono">
                  NS {c.company.netsuite_number}
                </div>
              )}
            </div>
          ),
        },
        {
          header: 'Status',
          cell: (c) =>
            c.enabled ? (
              <Badge variant="success">Enabled</Badge>
            ) : (
              <Badge variant="muted">Disabled</Badge>
            ),
        },
        {
          header: 'Created',
          className: 'hidden lg:table-cell',
          cell: (c) => (
            <span className="text-sm text-muted-foreground">
              {new Date(c.created_at).toLocaleDateString()}
            </span>
          ),
        },
      ]}
    />
  );
}
