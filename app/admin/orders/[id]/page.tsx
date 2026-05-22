'use client';

import { useParams } from 'next/navigation';
import AdminOrderDetailsView from '../../../components/admin/AdminOrderDetailsView';

export default function AdminOrderViewPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <AdminOrderDetailsView
      orderId={orderId}
      backUrl="/admin/orders"
      editUrl={`/admin/orders/${orderId}/edit`}
      packingSlipUrl={`/admin/orders/${orderId}/packing-slip`}
    />
  );
}
