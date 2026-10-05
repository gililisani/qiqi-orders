'use client';

import { supabase } from '../../../lib/supabaseClient';
import { AdminListPage } from '../../components/admin/AdminListPage';

interface Subsidiary {
  id: string;
  name: string;
  netsuite_id: string | null;
  ship_from_address?: string;
  phone?: string;
  email?: string;
  route?: { location?: { location_name: string } | null } | null;
}

export default function SubsidiariesPage() {
  return (
    <AdminListPage<Subsidiary>
      title="Subsidiaries"
      description="Your legal entities (NetSuite subsidiaries). Where each one ships from is set in Settings → Fulfillment."
      newUrl="/admin/subsidiaries/new"
      newLabel="Add subsidiary"
      editUrl={(id) => `/admin/subsidiaries/${id}/edit`}
      fetch={() =>
        supabase
          .from('subsidiaries')
          .select('*, route:fulfillment_routes(location:Locations(location_name))')
          .order('name')
      }
      searchPlaceholder="Search subsidiaries…"
      filterRow={(s, q) => (s.name ?? '').toLowerCase().includes(q)}
      columns={[
        {
          header: 'Name',
          cell: (s) => (
            <div>
              <div className="text-sm font-medium text-foreground">{s.name}</div>
              {s.ship_from_address && (
                <div className="text-xs text-muted-foreground truncate max-w-md">
                  {s.ship_from_address}
                </div>
              )}
            </div>
          ),
        },
        {
          header: 'NetSuite ID',
          className: 'hidden md:table-cell',
          cell: (s) =>
            s.netsuite_id ? (
              <span className="font-mono text-xs">{s.netsuite_id}</span>
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            ),
        },
        {
          header: 'Ships from',
          cell: (s) =>
            s.route?.location?.location_name ? (
              <span className="text-sm">{s.route.location.location_name}</span>
            ) : (
              <span className="text-xs text-muted-foreground">Not set</span>
            ),
        },
        {
          header: 'Contact',
          className: 'hidden lg:table-cell',
          cell: (s) => (
            <div className="text-xs">
              {s.email && <div>{s.email}</div>}
              {s.phone && <div className="text-muted-foreground">{s.phone}</div>}
              {!s.email && !s.phone && <span className="text-muted-foreground">—</span>}
            </div>
          ),
        },
      ]}
    />
  );
}
