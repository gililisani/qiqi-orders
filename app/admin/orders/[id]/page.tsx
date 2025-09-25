'use client';

import { useParams } from 'next/navigation';
import AdminLayout from '../../../components/AdminLayout';
import OrderDetailsView from '../../../components/shared/OrderDetailsView';

export default function AdminOrderViewPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <AdminLayout>
      <div className="space-y-8 pb-16">
        <OrderDetailsView
          role="admin"
          orderId={orderId}
          backUrl="/admin/orders"
          editUrl={`/admin/orders/${orderId}/edit`}
          packingSlipUrl={`/admin/orders/${orderId}/packing-slip`}
        />
      </div>
    </AdminLayout>
  );
}
