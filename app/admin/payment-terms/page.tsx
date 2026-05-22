'use client';

import { supabase } from '../../../lib/supabaseClient';
import { AdminListPage } from '../../components/admin/AdminListPage';

interface PaymentTerm {
  id: number;
  name: string;
  description: string | null;
}

export default function PaymentTermsPage() {
  return (
    <AdminListPage<PaymentTerm>
      title="Payment Terms"
      description="Payment term options assigned to companies."
      newUrl="/admin/payment-terms/new"
      newLabel="Add payment term"
      editUrl={(id) => `/admin/payment-terms/${id}/edit`}
      fetch={() => supabase.from('payment_terms').select('*').order('name')}
      searchPlaceholder="Search payment terms…"
      filterRow={(p, q) =>
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      }
      columns={[
        {
          header: 'Name',
          cell: (p) => <span className="text-sm font-medium">{p.name}</span>,
        },
        {
          header: 'Description',
          className: 'hidden md:table-cell',
          cell: (p) =>
            p.description ? (
              <span className="text-sm text-muted-foreground">{p.description}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
      ]}
    />
  );
}
