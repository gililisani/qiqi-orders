'use client';

import { supabase } from '../../../lib/supabaseClient';
import { AdminListPage } from '../../components/admin/AdminListPage';
import { Badge } from '../../components/qq/badge';

interface Location {
  id: string;
  location_name: string;
  country: string | null;
  netsuite_id: string | null;
  active: boolean | null;
  subsidiary?: { name: string } | null;
}

export default function LocationsPage() {
  return (
    <AdminListPage<Location>
      title="Locations"
      description="Warehouses the Hub can ship from. Which subsidiary ships from where is set in Settings → Fulfillment."
      newUrl="/admin/locations/new"
      newLabel="Add location"
      editUrl={(id) => `/admin/locations/${id}/edit`}
      fetch={() =>
        supabase
          .from('Locations')
          .select('*, subsidiary:subsidiaries(name)')
          .order('active', { ascending: false })
          .order('location_name')
      }
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
          header: 'Owned by',
          cell: (loc) =>
            loc.subsidiary?.name ? (
              <span className="text-sm">{loc.subsidiary.name}</span>
            ) : (
              <span className="text-xs text-destructive">No subsidiary</span>
            ),
        },
        {
          header: 'Status',
          cell: (loc) =>
            loc.active === false ? (
              <Badge variant="muted">Retired</Badge>
            ) : (
              <Badge variant="success">Active</Badge>
            ),
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
