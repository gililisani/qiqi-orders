'use client';

import { useParams } from 'next/navigation';
import AdminLayout from '../../../../components/AdminLayout';
import OrderFormView from '../../../../components/shared/OrderFormView';

export default function AdminEditOrderPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <AdminLayout>
      <OrderFormView
        role="admin"
        orderId={orderId}
        backUrl={`/admin/orders/${orderId}`}
      />
    </AdminLayout>
  );
}
