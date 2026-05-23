'use client';

import { supabase } from '../../../lib/supabaseClient';
import { AdminListPage } from '../../components/admin/AdminListPage';
import { Badge } from '../../components/qq/badge';
import { SupportFundBadge } from '../../components/qq/support-fund-badge';

interface Company {
  id: string;
  company_name: string;
  netsuite_number: string;
  support_fund?: { percent: number } | null;
  subsidiary?: { name: string } | null;
  location?: { location_name: string } | null;
  user_count: number;
  order_count: number;
}

async function fetchCompanies(): Promise<{ data: Company[] | null; error: any }> {
  const { data, error } = await supabase
    .from('companies')
    .select(`
      id,
      company_name,
      netsuite_number,
      support_fund:support_fund_levels(percent),
      subsidiary:subsidiaries(name),
      location:Locations(location_name)
    `)
    .order('company_name', { ascending: true });

  if (error) return { data: null, error };

  // N+1 counts — fine for an admin tool with ~50-100 companies. If this
  // grows, switch to a SQL view or a single batched RPC.
  const withCounts = await Promise.all(
    (data || []).map(async (c: any) => {
      const [u, o] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('company_id', c.id),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('company_id', c.id),
      ]);
      return {
        ...c,
        user_count: u.count || 0,
        order_count: o.count || 0,
      } as Company;
    })
  );

  return { data: withCounts, error: null };
}

export default function CompaniesPage() {
  return (
    <AdminListPage<Company>
      title="Companies"
      description="Partner companies that place orders through the Hub."
      newUrl="/admin/companies/new"
      newLabel="Add company"
      editUrl={(id) => `/admin/companies/${id}`}
      fetch={() => fetchCompanies()}
      searchPlaceholder="Search by name or NetSuite number…"
      filterRow={(c, q) =>
        (c.company_name ?? '').toLowerCase().includes(q) ||
        (c.netsuite_number ?? '').toLowerCase().includes(q)
      }
      columns={[
        {
          header: 'Company',
          cell: (c) => (
            <div>
              <div className="text-sm font-medium text-foreground">
                {c.company_name || 'Unnamed company'}
              </div>
              <div className="text-xs text-muted-foreground">
                {c.subsidiary?.name || 'No subsidiary'}
              </div>
            </div>
          ),
        },
        {
          header: 'NS Number',
          className: 'hidden md:table-cell',
          cell: (c) =>
            c.netsuite_number ? (
              <span className="font-mono text-sm">{c.netsuite_number}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          header: 'Support fund',
          cell: (c) =>
            c.support_fund?.percent ? (
              <SupportFundBadge percent={c.support_fund.percent} />
            ) : (
              <Badge variant="muted">0%</Badge>
            ),
        },
        {
          header: 'Users / Orders',
          className: 'hidden lg:table-cell',
          cell: (c) => (
            <div className="text-sm">
              <span className="font-mono">{c.user_count}</span>
              <span className="text-muted-foreground"> · </span>
              <span className="font-mono">{c.order_count}</span>
            </div>
          ),
        },
        {
          header: 'Location',
          className: 'hidden lg:table-cell',
          cell: (c) => c.location?.location_name || <span className="text-muted-foreground">—</span>,
        },
      ]}
    />
  );
}
