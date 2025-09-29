'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '../../../../hooks/useAuth';
import AdminLayout from '../../../../components/AdminLayout';
import OrderFormView from '../../../../components/shared/OrderFormView';

export default function AdminEditOrderPage() {
  const params = useParams();
  const orderId = params.id as string;
  const { loading } = useAuth('Admin');

  return (
    <AdminLayout>
      <OrderFormView
        role="admin"
        orderId={orderId}
        backUrl="/admin/orders"
        parentLoading={loading}
      />
    </AdminLayout>
  );
}
