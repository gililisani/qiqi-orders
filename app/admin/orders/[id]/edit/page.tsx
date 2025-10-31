'use client';

import { useParams } from 'next/navigation';
import AdminLayoutWrapper from '../../../../components/template/AdminLayoutWrapper';
import { adminRoutes } from '../../../../config/admin-routes';
import OrderFormView from '../../../../components/shared/OrderFormView';

export default function AdminEditOrderPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <AdminLayoutWrapper routes={adminRoutes}>
      <OrderFormView
        role="admin"
        orderId={orderId}
        backUrl={`/admin/orders/${orderId}`}
      />
    </AdminLayoutWrapper>
  );
}
