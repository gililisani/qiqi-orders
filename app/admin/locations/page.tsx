'use client';

import { supabase } from '../../../lib/supabaseClient';
import { AdminListPage } from '../../components/admin/AdminListPage';

interface Location {
  id: string;
  location_name: string;
  country: string | null;
  netsuite_id: string | null;
}

export default function LocationsPage() {
  return (
    <AdminListPage<Location>
      title="Locations"
      description="Warehouse and stocking locations used in NetSuite."
      newUrl="/admin/locations/new"
      newLabel="Add location"
      editUrl={(id) => `/admin/locations/${id}/edit`}
      fetch={() => supabase.from('Locations').select('*').order('location_name')}
      searchPlaceholder="Search locations…"
      filterRow={(loc, q) =>
        (loc.location_name ?? '').toLowerCase().includes(q) ||
        (loc.country ?? '').toLowerCase().includes(q)
      }
      columns={[
        {
          header: 'Location',
          cell: (loc) => <span className="text-sm font-medium">{loc.location_name}</span>,
        },
        {
          header: 'Country',
          className: 'hidden md:table-cell',
          cell: (loc) =>
            loc.country ? loc.country : <span className="text-muted-foreground">—</span>,
        },
        {
          header: 'NetSuite ID',
          cell: (loc) =>
            loc.netsuite_id ? (
              <span className="font-mono text-xs">{loc.netsuite_id}</span>
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            ),
        },
      ]}
    />
  );
}
