'use client';

import { useParams } from 'next/navigation';
import AdminLayout from '../../../../components/AdminLayout';
import PackingSlipView from '../../../../components/shared/PackingSlipView';

export default function AdminPackingSlipViewPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <AdminLayout>
      <PackingSlipView
        role="admin"
        backUrl={`/admin/orders/${orderId}`}
      />
    </AdminLayout>
  );
}