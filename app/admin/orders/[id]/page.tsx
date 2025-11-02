'use client';

import { useParams } from 'next/navigation';
import AdminLayoutWrapper from '../../../components/template/AdminLayoutWrapper';
import { adminRoutes } from '../../../config/admin-routes';
import OrderDetailsView from '../../../components/shared/OrderDetailsView';

export default function AdminOrderViewPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <AdminLayoutWrapper routes={adminRoutes}>
      <div className="space-y-8 pb-16">
        <OrderDetailsView
          role="admin"
          orderId={orderId}
          backUrl="/admin/orders"
          editUrl={`/admin/orders/${orderId}/edit`}
          packingSlipUrl={`/admin/orders/${orderId}/packing-slip`}
        />
      </div>
    </AdminLayoutWrapper>
  );
}
