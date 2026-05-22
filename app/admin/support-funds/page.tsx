'use client';

import { supabase } from '../../../lib/supabaseClient';
import { AdminListPage } from '../../components/admin/AdminListPage';

interface SupportFund {
  id: string;
  percent: number;
}

export default function SupportFundsPage() {
  return (
    <AdminListPage<SupportFund>
      title="Support Funds"
      description="Support fund percentages that companies can be assigned."
      newUrl="/admin/support-funds/new"
      newLabel="Add support fund"
      editUrl={(id) => `/admin/support-funds/${id}/edit`}
      fetch={() => supabase.from('support_fund_levels').select('*').order('percent')}
      columns={[
        {
          header: 'Percent',
          cell: (s) => (
            <span className="font-mono text-sm font-medium tabular-nums">{s.percent}%</span>
          ),
        },
      ]}
    />
  );
}
